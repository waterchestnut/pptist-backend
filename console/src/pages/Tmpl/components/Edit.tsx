import React, {ForwardRefRenderFunction, useImperativeHandle, useRef, useState} from 'react'
import {
  ModalForm,
  ProCard, ProFormDigit,
  ProFormGroup,
  ProFormInstance,
  ProFormList, ProFormSelect, ProFormSwitch,
  ProFormText, ProFormTextArea, ProFormUploadButton
} from '@ant-design/pro-components'
import {formatUploadFile, getDocHttpUrl, isArray, uuidV4, waitTime} from '@/utils/util'
import {errorMessage, successMessage} from '@/utils/msg'
import {addPptInfo, updatePptInfo} from '@/services/pptonline/pptInfo'
import StatusEnum from '@/enum/StatusEnum'
import {getAccessToken} from '@/utils/authority'
import {Input, Space, Upload} from 'antd'
import {UploadOutlined} from '@ant-design/icons'

export type EditProps = {
  onEditFinish?: (resData?: any) => Promise<void>;
  apiRelativeUrls?: any;
  addHidePptCode?: boolean;
  forcePptType?: string;
};

export type EditAction = {
  show: (record?: any) => void;
  close: () => void;
}

const formItemLayout =
  {
    labelCol: {span: 4},
    wrapperCol: {span: 20},
  }

const inlineItemLayout = {
  labelCol: {span: 8},
  wrapperCol: {span: 16},
}

const coverTip = '仅支持PNG、JPG、WEBP的图片，文件大小不超过500K。'

const Edit: ForwardRefRenderFunction<EditAction, EditProps> = (props, ref) => {
  const {onEditFinish, addHidePptCode, apiRelativeUrls, forcePptType} = props
  const [isOpen, setIsOpen] = useState(false)
  const [pptInfo, setPptInfo] = useState<any>(null)
  const formRef = useRef<ProFormInstance>()

  const handleOk = async () => {
    try {
      await formRef?.current?.validateFields()
    } catch (e) {
      console.error(e)
      return
    }
    let formData = formRef?.current?.getFieldsFormatValue?.(true)
    if (!formatSubmitInfo(formData)) {
      return
    }
    let ret
    let tip
    if (pptInfo) {
      ret = await updatePptInfo(formData, apiRelativeUrls?.updatePptInfo)
      tip = '修改课件模版'
    } else {
      ret = await addPptInfo(formData, apiRelativeUrls?.addPptInfo)
      tip = '添加课件模版'
    }
    if (ret.code !== 0) {
      let msg = ret.msg || tip + '失败，请稍后再试'
      return errorMessage(msg)
    }

    if (onEditFinish) {
      await onEditFinish()
    }
    successMessage(tip + '成功')
    setIsOpen(false)
  }

  const handleCancel = () => {
    setIsOpen(false)
  }

  useImperativeHandle(ref, () => ({
    show: async (info: any) => {
      setPptInfo(info || null)
      waitTime(200).then(() => {
        if (info) {
          info.coverUrl = info.coverUrl || []
          formatShowInfo(info)
          formRef?.current?.setFieldsValue(info)
        } else {
          formRef?.current?.resetFields()
        }
      })
      setIsOpen(true)
    },
    close: () => {
      handleCancel()
    }
  }))

  const formatShowInfo = (info: any) => {
    if (info.coverUrl) {
      info.coverUrl = isArray(info.coverUrl) ? info.coverUrl.map((_: string) => getDocHttpUrl(_)) : info.coverUrl ? [{
        uid: '-1',
        url: getDocHttpUrl(info.coverUrl)
      }] : []
    }
    info.theme = info.theme ? JSON.stringify(info.theme, null, 4) : '{}'
    info.slides = info.slides ? JSON.stringify(info.slides, null, 4) : '[]'
  }

  const formatSubmitInfo = (info: any) => {
    info.coverUrl = formatUploadFile(info.coverUrl).find(_ => !_.status || _.status === 'done')?.url || ''
    try {
      info.theme = JSON.parse(info.theme)
    } catch (e: any) {
      errorMessage(e.message)
      return false
    }
    try {
      info.slides = JSON.parse(info.slides)
    } catch (e: any) {
      errorMessage(e.message)
      return false
    }
    /*console.log(info)
    return false*/
    return true
  }

  const handleJSONFileChange = (event: any) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = function (e) {
        // @ts-ignore
        const content = e.target.result as string
        try {
          let metas = JSON.parse(content)
          formatShowInfo(metas)
          formRef?.current?.setFieldsValue(metas)
        } catch (e) {
          errorMessage('文件内容格式不正确')
        }
      }
      reader.readAsText(file, 'utf-8')
    }
  }

  return (
    <ModalForm
      title={
        <Space>
          <span>{(pptInfo ? pptInfo.viewer ? '查看' : '编辑' : '新建') + '课件模版'}</span>
          <span>
            <label htmlFor='jsonFileInput' title='选择本地模版文件'><a
              style={{fontWeight: 'normal', marginLeft: '48px'}}><UploadOutlined
              style={{marginRight: '8px'}}/>使用本地模版文件</a></label>
            <Input type='file' id='jsonFileInput' accept='.json' onChange={handleJSONFileChange}
                   style={{display: 'none'}}/>
          </span>
        </Space>
      }
      open={isOpen}
      layout={'horizontal'}
      modalProps={
        {
          onCancel: handleCancel,
          centered: true,
          destroyOnClose: true,
          width: 1000
        }
      }
      onFinish={async () => {
        await handleOk()
      }}
      formRef={formRef}
      {...formItemLayout}
      grid={true}
      readonly={pptInfo?.viewer}
      submitter={pptInfo?.viewer ? false : undefined}
    >
      {
        !addHidePptCode || pptInfo?.pptCode ?
          <ProFormText
            name='pptCode'
            label='模版标识'
            rules={[
              {
                required: true,
                message: '请输入模版标识',
              },
            ]}
            readonly={pptInfo?.viewer || pptInfo?.pptCode}
          /> : null
      }
      <ProFormText
        name='title'
        label='模版标题'
        rules={[
          {
            required: true,
            message: '请输入标题',
          },
        ]}
      />
      <ProFormSelect
        name='pptType'
        label='模版类型'
        rules={[
          {
            required: true,
            message: '请选择模版类型',
          },
        ]}
        readonly={!!forcePptType}
        initialValue={forcePptType || 'platformTmpl'}
        options={[
          {
            label: '内置模版',
            value: 'buildInTmpl'
          },
          {
            label: '平台模版',
            value: 'platformTmpl'
          },
          {
            label: '用户个人模版',
            value: 'userTmpl'
          }
        ]}
      />
      <ProFormSwitch
        name='aiIndividual'
        label='AI个性化使用'
        rules={[
          {
            required: true,
          },
        ]}
        initialValue={false}
      />
      {
        pptInfo?.pptCode ?
          <ProFormSelect
            name='status'
            label='状态'
            readonly
            options={StatusEnum.toOptions()}
          /> : null
      }
      <ProFormUploadButton
        label='封面'
        name='coverUrl'
        title='选择图片'
        max={1}
        fieldProps={{
          name: 'coverUrl',
          listType: 'picture-card',
          accept: '.png, .jpg, .jpeg, .webp',
          beforeUpload: (file) => {
            const isAcceptImg = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp'
            if (!isAcceptImg) {
              errorMessage(coverTip)
            }
            const isLt = file.size / 1024 < 500
            if (!isLt) {
              errorMessage(coverTip)
            }
            return (isAcceptImg && isLt) || Upload.LIST_IGNORE
          },
          headers: {'param-accessToken': getAccessToken()},
          onRemove: (file) => {
            return !(pptInfo?.viewer)
          }
        }}  // @ts-ignore
        action={DOC_API_BASE + '/file/upload/simple'}
        extra={coverTip}
        onChange={({file, fileList}) => {
          if (file.response && file.response.code !== 0) {
            file.status = 'error'
            errorMessage('上传失败：' + (file.response.msg || '请稍后再试'))
            fileList.splice(fileList.findIndex(_ => _.uid === file.uid), 1)
          }
        }}
        rules={[
          {
            required: true,
            message: '请上传封面',
          },
        ]}
      />
      <ProFormTextArea
        name='description'
        label='模版描述'
        rules={[
          {
            required: true,
            message: '请输入描述',
          },
        ]}
      />
      <ProFormDigit
        name='width'
        label='模版宽度'
        rules={[
          {
            required: true,
            message: '请输入宽度',
          },
        ]}
      />
      <ProFormDigit
        name='height'
        label='模版高度'
        rules={[
          {
            required: true,
            message: '请输入高度',
          },
        ]}
      />
      <ProFormTextArea
        name='theme'
        label='主题'
      />
      <ProFormTextArea
        name='slides'
        label='模版页'
      />
      <ProFormList
        name='tags'
        label='标签'
        creatorButtonProps={{
          creatorButtonText: '添加标签',
        }}
        copyIconProps={{tooltipText: '复制'}}
        deleteIconProps={{tooltipText: '删除'}}
        itemRender={({listDom, action}, {index}) => (
          <ProCard
            bordered
            style={{marginBlockEnd: 8}}
            extra={action}
            bodyStyle={{paddingBlockEnd: 0}}
          >
            {listDom}
          </ProCard>
        )}
        rowProps={
          {style: {margin: 0}}
        }
      >
        <ProFormGroup>
          <ProFormText
            name='key'
            label='标签名'
            rules={[
              {
                required: true,
                message: '请输入标签名',
              },
            ]}
            colProps={{span: 12}}
            {...inlineItemLayout}
          />
          <ProFormText
            name='value'
            label='标签值'
            rules={[
              {
                required: true,
                message: '请输入标签值',
              },
            ]}
            colProps={{span: 12}}
            {...inlineItemLayout}
          />
        </ProFormGroup>
      </ProFormList>
    </ModalForm>
  )
}

export default React.forwardRef(Edit)
