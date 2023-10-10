import { useEffect, useState } from 'react'

import classNames from 'classnames'

import { Governance } from '../../clients/Governance'
import { ServiceHealth, SnapshotStatus as SnapshotServiceStatus } from '../../clients/SnapshotTypes'
import { SNAPSHOT_STATUS_ENABLED } from '../../constants'
import { useBurgerMenu } from '../../hooks/useBurgerMenu'
import useFormatMessage from '../../hooks/useFormatMessage'
import Markdown from '../Common/Typography/Markdown'
import WarningTriangle from '../Icon/WarningTriangle'

import './SnapshotStatus.css'

const PING_INTERVAL_IN_MS = 30000 // 30 seconds

function logIfNotNormal(status: SnapshotServiceStatus) {
  if (status.scoresStatus.health !== ServiceHealth.Normal || status.graphQlStatus.health !== ServiceHealth.Normal) {
    console.log('Snapshot Status', status)
  }
}

export default function SnapshotStatus() {
  const t = useFormatMessage()
  const [showTopBar, setShowTopBar] = useState(false)
  const { setStatus } = useBurgerMenu()

  const updateServiceStatus = async () => {
    const status = await Governance.get().getSnapshotStatus()
    logIfNotNormal(status)
    const show = status.scoresStatus.health === ServiceHealth.Failing && SNAPSHOT_STATUS_ENABLED
    setShowTopBar(show)
    setStatus((prev) => ({ ...prev, snapshotStatusBarOpen: show }))
  }

  useEffect(() => {
    const intervalId = setInterval(updateServiceStatus, PING_INTERVAL_IN_MS)
    return () => clearInterval(intervalId)
  }, [])

  return (
    <div className={classNames(`SnapshotStatus__TopBar`, showTopBar && 'SnapshotStatus__TopBar--visible')}>
      <WarningTriangle size="18" />
      <Markdown size="sm" componentsClassNames={{ p: 'SnapshotStatus__Text', strong: 'SnapshotStatus__Text' }}>
        {t('page.debug.snapshot_status.label')}
      </Markdown>
    </div>
  )
}
