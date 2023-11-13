import { useEffect, useState } from 'react'

import { PriorityProposal, ProposalAttributes } from '../../entities/Proposal/types'
import { isSameAddress } from '../../entities/Snapshot/utils'
import { VotesForProposals } from '../../entities/Votes/types'
import useFormatMessage from '../../hooks/useFormatMessage'
import usePriorityProposals from '../../hooks/usePriorityProposals'
import useProposalsCachedVotes from '../../hooks/useProposalsCachedVotes'
import locations from '../../utils/locations'
import { ActionBox } from '../Common/ActionBox'
import Counter from '../Common/Counter'
import FullWidthButton from '../Common/FullWidthButton'
import ProposalPreviewCard from '../Common/ProposalPreviewCard/ProposalPreviewCard'

import './PriorityProposalsBox.css'

interface Props {
  address?: string | null
  collapsible?: boolean
}

const PROPOSALS_PER_PAGE = 5

function renderPriorityProposals(
  priorityProposals: any[] | Partial<ProposalAttributes>[] | undefined,
  displayedProposals: number
) {
  return (
    <>
      {priorityProposals &&
        priorityProposals.slice(0, displayedProposals).map((proposal) => {
          return <ProposalPreviewCard key={proposal.id} proposal={proposal as ProposalAttributes} variant="slim" />
        })}
    </>
  )
}

function getDisplayedProposals(
  votes?: VotesForProposals,
  priorityProposals?: PriorityProposal[],
  lowerAddress?: string | null
) {
  return votes && priorityProposals && lowerAddress
    ? priorityProposals?.filter((proposal) => {
        const hasVotedOnMain = votes && lowerAddress && votes[proposal.id] && !!votes[proposal.id][lowerAddress]
        const hasVotedOnLinked =
          proposal.linked_proposals_data &&
          proposal.linked_proposals_data.some(
            (linkedProposal) => votes[linkedProposal.id] && !!votes[linkedProposal.id][lowerAddress]
          )
        const hasAuthoredBid =
          proposal.unpublished_bids_data &&
          proposal.unpublished_bids_data.some((linkedBid) => isSameAddress(linkedBid.author_address, lowerAddress))

        return !hasVotedOnMain && !hasVotedOnLinked && !hasAuthoredBid
      })
    : priorityProposals
}

function PriorityProposalsBox({ address, collapsible = false }: Props) {
  const t = useFormatMessage()
  const lowerAddress = address?.toLowerCase()
  const { priorityProposals, isLoading } = usePriorityProposals(lowerAddress)
  const proposalIds =
    priorityProposals?.reduce((acc: string[], priorityProposal) => {
      acc.push(priorityProposal.id)
      if (priorityProposal.linked_proposals_data && priorityProposal.linked_proposals_data.length > 0) {
        priorityProposal.linked_proposals_data.map((linkedProposal) => acc.push(linkedProposal.id))
      }
      return acc
    }, []) || []

  const { votes, isLoadingVotes } = useProposalsCachedVotes(proposalIds || [])
  const [displayedProposals, setDisplayedProposals] = useState(
    getDisplayedProposals(votes, priorityProposals, lowerAddress)
  )

  useEffect(() => {
    setDisplayedProposals(getDisplayedProposals(votes, priorityProposals, lowerAddress))
  }, [isLoadingVotes, lowerAddress, priorityProposals, votes])

  const [displayedProposalsAmount, setDisplayedProposalsAmount] = useState(PROPOSALS_PER_PAGE)
  const hasMoreProposals = displayedProposals && displayedProposals.length > PROPOSALS_PER_PAGE
  const showViewMoreButton = hasMoreProposals && displayedProposalsAmount < displayedProposals.length
  const showViewLessButton = hasMoreProposals && displayedProposalsAmount >= displayedProposals.length

  const handleViewMore = () => {
    if (displayedProposals) setDisplayedProposalsAmount(displayedProposals.length)
  }

  const handleViewLess = () => {
    if (displayedProposals) setDisplayedProposalsAmount(PROPOSALS_PER_PAGE)
  }

  return isLoading || (!isLoading && priorityProposals && priorityProposals.length === 0) ? null : (
    <>
      {collapsible ? (
        <ActionBox
          title={t('component.priority_proposals.title')}
          info={t('component.priority_proposals.info')}
          collapsible
          collapsedTitle={
            <span className="PriorityProposalsBox__CollapsedTitle">
              <Counter count={displayedProposals?.length} />
              {t('component.priority_proposals.title')}
            </span>
          }
        >
          {renderPriorityProposals(displayedProposals, displayedProposalsAmount)}
          {showViewMoreButton && (
            <FullWidthButton onClick={handleViewMore}>
              {t('component.priority_proposals.show_all', { count: displayedProposals?.length })}
            </FullWidthButton>
          )}
          {showViewLessButton && <FullWidthButton onClick={handleViewLess}>{`Show less`}</FullWidthButton>}
        </ActionBox>
      ) : (
        <>
          {renderPriorityProposals(displayedProposals, displayedProposalsAmount)}
          <FullWidthButton href={locations.proposals()}>
            {t('page.home.open_proposals.view_all_proposals')}
          </FullWidthButton>
        </>
      )}
    </>
  )
}

export default PriorityProposalsBox
