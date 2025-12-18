import React, {ForwardRefRenderFunction, useImperativeHandle, useRef, useState} from 'react'
import {Modal, Spin, Input} from 'antd'
import {getAccessToken} from '@/utils/authority'
import {getTmplPrompts} from '@/services/pptonline/tmpl'

const {TextArea} = Input

export type PromptViewProps = {
  onClose?: (resData?: any) => Promise<void>;
  title?: string;
};

export type PromptViewAction = {
  show: (record?: any) => void;
  close: () => void;
}

const PromptView: ForwardRefRenderFunction<PromptViewAction, PromptViewProps> = (props, ref) => {
  const {onClose, title} = props
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prompts, setPrompts] = useState<any>([])

  const handleCancel = () => {
    setIsOpen(false)
    onClose && onClose()
  }

  useImperativeHandle(ref, () => ({
    show: async (tmplCode: string) => {
      setIsOpen(true)
      await loadData(tmplCode)
    },
    close: () => {
      handleCancel()
    }
  }))

  async function loadData(tmplCode: string) {
    setLoading(true)
    let data = await getTmplPrompts(tmplCode)
    setPrompts(data)
    setLoading(false)
  }

  return (
    <Modal
      title={`大模型生成课件示例提示词`}
      open={isOpen}
      onCancel={handleCancel}
      centered={true}
      destroyOnClose={true}
      forceRender={true}
      footer={null}
      width={900}
      className='modal-fixed modal-no-footer'
    >
      <div style={{padding: '24px 0'}}>
        {
          loading ?
            <Spin percent={'auto'} size='large' tip='提示词加载中...'/>
            :
            <TextArea
              value={JSON.stringify(prompts, null, 2)}
              autoSize
              readOnly
            />
        }
      </div>
    </Modal>
  )
}

export default React.forwardRef(PromptView)
