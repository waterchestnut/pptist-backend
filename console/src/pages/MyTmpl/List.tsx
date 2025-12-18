import React from 'react'
import TmplList from '@/pages/Tmpl/List'

const MyTmplList: React.FC = () => {
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
    <TmplList
      addHidePptCode
      apiRelativeUrls={apiRelativeUrls}
      defaultFilter={{pptType: ['userTmpl']}}
      forcePptType='userTmpl'
    />
  )
}

export default MyTmplList
