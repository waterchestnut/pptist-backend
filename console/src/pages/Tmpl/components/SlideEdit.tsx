import React, {ForwardRefRenderFunction, useImperativeHandle, useRef, useState} from 'react'
import {Modal} from 'antd'
import {ExclamationCircleOutlined} from '@ant-design/icons'
import {getAccessToken} from '@/utils/authority'

export type SlideEditProps = {
  onClose?: (resData?: any) => Promise<void>;
  title?: string;
  version?: number;
};

export type SlideEditAction = {
  show: (record?: any) => void;
  close: () => void;
}

const SlideEdit: ForwardRefRenderFunction<SlideEditAction, SlideEditProps> = (props, ref) => {
  const {onClose, title,version} = props
  const [isOpen, setIsOpen] = useState(false)
  const [pptInfo, setPptInfo] = useState<any>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const doClose = () => {
    setIsOpen(false)
    onClose && onClose()
  }

  /*关闭课件制作弹层时提醒保存课件*/
  const handleCancel = () => {
    Modal.confirm({
      title: '关闭课件制作',
      icon: <ExclamationCircleOutlined/>,
      content: '请确认课件修改已在编辑器中点击“保存”。未保存的修改将丢失，确定要关闭吗？',
      okText: '仍要关闭',
      cancelText: '继续编辑',
      onOk: doClose,
    })
  }

  useImperativeHandle(ref, () => ({
    show: async (info: any) => {
      setPptInfo(info || null)
      setIsOpen(true)
    },
    close: () => {
      handleCancel()
    }
  }))

  return (
    <Modal
      title={title || `课件模版制作`}
      open={isOpen}
      onCancel={handleCancel}
      centered={true}
      destroyOnClose={true}
      forceRender={true}
      footer={null}
      width='100%'
      className='modal-fixed modal-no-footer'
    >
      {
        pptInfo?.pptCode ? <iframe
          id={`iframe-${pptInfo.pptCode}`}
          style={{width: '100%', height: 'calc(100% - 8px)', overflow: 'visible'}}
          onLoad={() => {
          }}
          ref={previewRef}
          // @ts-ignore
          src={`${PPTONLINE_PLATFORM_BASE}/?pptCode=${pptInfo.pptCode}&accessToken=${getAccessToken()}&version=${version}&noLeaveConfirm=1`}
          width='100%'
          height='100%'
          scrolling='no'
          frameBorder='0'
          allow="fullscreen; autoplay; clipboard-read; clipboard-write"
        /> : null
      }
    </Modal>
  )
}

export default React.forwardRef(SlideEdit)
