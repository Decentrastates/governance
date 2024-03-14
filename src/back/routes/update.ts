import { WithAuth, auth } from 'decentraland-gatsby/dist/entities/Auth/middleware'
import RequestError from 'decentraland-gatsby/dist/entities/Route/error'
import handleAPI from 'decentraland-gatsby/dist/entities/Route/handle'
import routes from 'decentraland-gatsby/dist/entities/Route/routes'
import validate from 'decentraland-gatsby/dist/entities/Route/validate'
import schema from 'decentraland-gatsby/dist/entities/Schema'
import { Request } from 'express'

import ProposalModel from '../../entities/Proposal/model'
import { ProposalAttributes } from '../../entities/Proposal/types'
import {
  FinancialRecord,
  FinancialUpdateSectionSchema,
  GeneralUpdateSectionSchema,
  UpdateGeneralSection,
} from '../../entities/Updates/types'
import {
  getCurrentUpdate,
  getFundsReleasedSinceLatestUpdate,
  getLatestUpdate,
  getNextPendingUpdate,
  getPendingUpdates,
  getPublicUpdates,
  getReleases,
  isBetweenLateThresholdDate,
} from '../../entities/Updates/utils'
import { DiscourseService } from '../../services/DiscourseService'
import { ErrorService } from '../../services/ErrorService'
import { FinancialService } from '../../services/FinancialService'
import { VestingService } from '../../services/VestingService'
import Time from '../../utils/date/Time'
import { ErrorCategory } from '../../utils/errorCategories'
import { CoauthorService } from '../services/coauthor'
import { UpdateService } from '../services/update'

import { getProposal } from './proposal'

export default routes((route) => {
  const withAuth = auth()
  route.get('/proposals/:proposal/updates', handleAPI(getProposalUpdates))
  route.get('/proposals/:update/update', handleAPI(getProposalUpdate))
  route.get('/proposals/:update_id/update/comments', handleAPI(getProposalUpdateComments))
  route.post('/proposals/:proposal/update', withAuth, handleAPI(createProposalUpdate))
  route.patch('/proposals/:proposal/update', withAuth, handleAPI(updateProposalUpdate))
  route.delete('/proposals/:update_id/update', withAuth, handleAPI(deleteProposalUpdate))
})

async function getProposalUpdate(req: Request<{ update: string }>) {
  const id = req.params.update

  if (!id) {
    throw new RequestError(`Missing id`, RequestError.NotFound)
  }

  const update = await UpdateService.getById(id)

  if (!update) {
    throw new RequestError(`Update not found: "${id}"`, RequestError.NotFound)
  }

  return update
}

async function getProposalUpdates(req: Request<{ proposal: string }>) {
  const proposal_id = req.params.proposal

  if (!proposal_id) {
    throw new RequestError(`Proposal not found: "${proposal_id}"`, RequestError.NotFound)
  }

  const updates = await UpdateService.getAllByProposalId(proposal_id)
  const publicUpdates = getPublicUpdates(updates)
  const nextUpdate = getNextPendingUpdate(updates)
  const currentUpdate = getCurrentUpdate(updates)
  const pendingUpdates = getPendingUpdates(updates)

  return {
    publicUpdates,
    pendingUpdates,
    nextUpdate,
    currentUpdate,
  }
}

async function getProposalUpdateComments(req: Request<{ update_id: string }>) {
  const update = await UpdateService.getById(req.params.update_id)
  if (!update) {
    throw new RequestError('Update not found', RequestError.NotFound)
  }

  const { id, discourse_topic_id } = update
  if (!discourse_topic_id) {
    throw new RequestError('No Discourse topic for this update', RequestError.NotFound)
  }

  try {
    return await DiscourseService.getPostComments(discourse_topic_id)
  } catch (error) {
    ErrorService.report('Error fetching discourse topic', {
      error,
      discourse_topic_id,
      updateId: id,
      category: ErrorCategory.Discourse,
    })
    return {
      comments: [],
      totalComments: 0,
    }
  }
}

const generalSectionValidator = schema.compile(GeneralUpdateSectionSchema)

function parseFinancialRecords(financial_records: unknown) {
  const parsedResult = FinancialUpdateSectionSchema.safeParse({ financial_records })
  if (!parsedResult.success) {
    ErrorService.report('Submission of invalid financial records', {
      error: parsedResult.error,
      category: ErrorCategory.Financial,
    })
    throw new RequestError(`Invalid financial records`, RequestError.BadRequest)
  }
  return parsedResult.data.financial_records
}

async function validateFinancialRecords(
  proposal: ProposalAttributes,
  financial_records: unknown
): Promise<FinancialRecord[] | null> {
  const [vestingData, updates] = await Promise.all([
    VestingService.getVestingInfo(proposal.vesting_addresses),
    UpdateService.getAllByProposalId(proposal.id),
  ])

  const releases = vestingData ? getReleases(vestingData) : undefined
  const publicUpdates = getPublicUpdates(updates)
  const latestUpdate = getLatestUpdate(publicUpdates || [])
  const { releasedFunds } = getFundsReleasedSinceLatestUpdate(latestUpdate, releases)
  return releasedFunds > 0 ? parseFinancialRecords(financial_records) : null
}

async function createProposalUpdate(req: WithAuth<Request<{ proposal: string }>>) {
  const { author, financial_records, ...body } = req.body
  const { health, introduction, highlights, blockers, next_steps, additional_notes } = validate<UpdateGeneralSection>(
    generalSectionValidator,
    body
  )
  try {
    const proposal = await getProposal(req)
    const financialRecords = await validateFinancialRecords(proposal, financial_records)
    return await UpdateService.create(
      {
        proposal_id: req.params.proposal,
        author,
        health,
        introduction,
        highlights,
        blockers,
        next_steps,
        additional_notes,
        financial_records: financialRecords,
      },
      req.auth!
    )
  } catch (error) {
    ErrorService.report('Error creating update', {
      error,
      category: ErrorCategory.Update,
    })
    throw new RequestError(`Something wnt wrong: ${error}`, RequestError.InternalServerError)
  }
}

async function updateProposalUpdate(req: WithAuth<Request<{ proposal: string }>>) {
  const { id, author, financial_records, ...body } = req.body
  const { health, introduction, highlights, blockers, next_steps, additional_notes } = validate<UpdateGeneralSection>(
    generalSectionValidator,
    body
  )
  const parsedResult = FinancialUpdateSectionSchema.safeParse({ financial_records })
  if (!parsedResult.success) {
    throw new RequestError(`Invalid financial records`, RequestError.BadRequest, parsedResult.error)
  }
  const parsedRecords = parsedResult.data.financial_records
  const update = await UpdateService.getById(id)
  const proposalId = req.params.proposal

  if (!update) {
    throw new RequestError(`Update not found: "${id}"`, RequestError.NotFound)
  }

  const user = req.auth

  const proposal = await ProposalModel.findOne<ProposalAttributes>({ id: req.params.proposal })
  const isAuthorOrCoauthor =
    user && (proposal?.user === user || (await CoauthorService.isCoauthor(proposalId, user))) && author === user

  if (!proposal || !isAuthorOrCoauthor) {
    throw new RequestError(`Unauthorized`, RequestError.Forbidden)
  }

  const now = new Date()
  const isOnTime = Time(now).isBefore(update.due_date)

  if (!isOnTime && !isBetweenLateThresholdDate(update.due_date)) {
    throw new RequestError(`Update is not on time: "${update.id}"`, RequestError.BadRequest)
  }

  return await UpdateService.updateProposalUpdate(
    update,
    {
      author,
      health,
      introduction,
      highlights,
      blockers,
      next_steps,
      additional_notes,
      financial_records: parsedRecords,
    },
    id,
    proposal,
    user!,
    now,
    isOnTime
  )
}

async function deleteProposalUpdate(req: WithAuth<Request<{ update_id: string }>>) {
  const id = req.params.update_id
  if (!id || typeof id !== 'string') {
    throw new RequestError(`Missing or invalid id`, RequestError.BadRequest)
  }

  const update = await UpdateService.getById(id)

  if (!update) {
    throw new RequestError(`Update not found: "${id}"`, RequestError.NotFound)
  }

  if (!update.completion_date) {
    throw new RequestError(`Update is not completed: "${update.id}"`, RequestError.BadRequest)
  }

  const user = req.auth
  const proposal = await ProposalModel.findOne<ProposalAttributes>({ id: update.proposal_id })

  const isAuthorOrCoauthor =
    user && (proposal?.user === user || (await CoauthorService.isCoauthor(update.proposal_id, user)))

  if (!proposal || !isAuthorOrCoauthor) {
    throw new RequestError(`Unauthorized`, RequestError.Forbidden)
  }

  await FinancialService.deleteRecordsByUpdateId(update.id)
  await UpdateService.delete(update)
  UpdateService.commentUpdateDeleteInDiscourse(update)

  return true
}
