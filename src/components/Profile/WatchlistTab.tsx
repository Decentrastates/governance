import React from 'react'

import useAuthContext from 'decentraland-gatsby/dist/context/Auth/useAuthContext'
import useFormatMessage from 'decentraland-gatsby/dist/hooks/useFormatMessage'

import usePaginatedProposals from '../../hooks/usePaginatedProposals'
import Empty from '../Common/Empty'
import FullWidthButton from '../Common/FullWidthButton'
import SkeletonBars from '../Common/SkeletonBars'
import Watermelon from '../Icon/Watermelon'

import ProposalCreatedItem from './ProposalCreatedItem'

const WatchlistTab = () => {
  const [account] = useAuthContext()
  const t = useFormatMessage()

  const { proposals, hasMoreProposals, loadMore, isLoadingProposals } = usePaginatedProposals({
    load: !!account,
    ...(!!account && { subscribed: account }),
  })

  return (
    <>
      {isLoadingProposals && <SkeletonBars amount={proposals.length || 5} height={89} />}
      {!isLoadingProposals && (
        <>
          {proposals.length > 0 ? (
            proposals.map((proposal) => <ProposalCreatedItem key={proposal.id} proposal={proposal} />)
          ) : (
            <Empty
              className="ActivityBox__Empty"
              icon={<Watermelon />}
              description={t('page.profile.activity.watchlist.empty')}
            />
          )}
        </>
      )}
      {!isLoadingProposals && hasMoreProposals && (
        <FullWidthButton onClick={loadMore}>{t('page.profile.activity.button')}</FullWidthButton>
      )}
    </>
  )
}

export default WatchlistTab
