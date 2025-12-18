import React from 'react'
import PptList from '@/pages/Ppt/List'

const MyPptList: React.FC = () => {
  const apiRelativeUrls: any = {
    getPptInfoList: '/ppt-my/list',
    addPptInfo: '/ppt/save',
    updatePptInfo: '/ppt-my/update',
    deletePptInfo: '/ppt-my/delete',
    enablePptInfo: '/ppt-my/enable',
    disablePptInfo: '/ppt-my/disable',
    getPptInfo: '/ppt-my/detail',
  }
  return (
    <PptList
      apiRelativeUrls={apiRelativeUrls}
    />
  )
}

export default MyPptList
