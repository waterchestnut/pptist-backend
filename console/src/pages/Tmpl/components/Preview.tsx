import React, {ForwardRefRenderFunction, useImperativeHandle, useRef, useState} from 'react'
import {Modal} from 'antd'
import {getAccessToken} from '@/utils/authority'

export type PreviewProps = {
  onClose?: (resData?: any) => Promise<void>;
  title?: string;
  version?: number;
};

export type PreviewAction = {
  show: (record?: any) => void;
  close: () => void;
}

const Preview: ForwardRefRenderFunction<PreviewAction, PreviewProps> = (props, ref) => {
  const {onClose, title, version} = props
  const [isOpen, setIsOpen] = useState(false)
  const [pptInfo, setPptInfo] = useState<any>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const handleCancel = () => {
    setIsOpen(false)
    onClose && onClose()
  }

  useImperativeHandle(ref, () => ({
    show: async (info: any) => {
      setPptInfo(null)
      setIsOpen(true)
      setTimeout(() => {
        setPptInfo(info || null)
      }, 500)
    },
    close: () => {
      handleCancel()
    }
  }))

  return (
    <Modal
      title={`${title || `课件模版预览`}（${pptInfo?.title || '加载中'}）`}
      open={isOpen}
      onCancel={handleCancel}
      centered={true}
      destroyOnClose={true}
      forceRender={true}
      footer={null}
      width={900}
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
          src={`${PPTONLINE_PLATFORM_BASE}/preview?pptCode=${pptInfo.pptCode}&accessToken=${getAccessToken()}&version=${version}`}
          width='100%'
          height='100%'
          scrolling='no'
          frameBorder='0'
        /> : null
      }
    </Modal>
  )
}

export default React.forwardRef(Preview)
