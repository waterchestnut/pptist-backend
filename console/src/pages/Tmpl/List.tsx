import {ActionType, PageContainer, ProCard, ProList} from '@ant-design/pro-components'
import {useModel} from '@umijs/max'
import {Button, Card, Popconfirm, Tag, Typography, theme, Space} from 'antd'
import React, {createRef, ReactNode, useRef} from 'react'
import {createStyles} from 'antd-style'
import {errorMessage, successMessage} from '@/utils/msg'
import {
  DeleteOutlined,
  DisconnectOutlined,
  EditOutlined,
  EyeOutlined,
  HighlightOutlined, JavaScriptOutlined,
  SafetyOutlined
} from '@ant-design/icons'
import {deletePptInfo, disablePptInfo, enablePptInfo, getPptInfoList} from '@/services/pptonline/pptInfo'
import {getDocHttpUrl} from '@/utils/util'
import Edit, {EditAction} from './components/Edit'
import PptTypeEnum from '@/enum/PptTypeEnum'
import Preview, {PreviewAction} from './components/Preview'
import SlideEdit, {SlideEditAction} from './components/SlideEdit'
import StatusEnum from '@/enum/StatusEnum'
import PromptView, {PromptViewAction} from './components/PromptView'

const useStyles = createStyles(({token, css}) => {
  return {
    container: {
      '.ant-pro-list-row': {
        paddingInline: '8px'
      }
    },
    coverImg: css`
      border-radius: 8px;
      object-fit: contain;
      border: 1px solid #d9d9d9;
      height: 100%;
      width: 385px;
    `
  }
})

export type TmplListProps = {
  apiRelativeUrls?: any;
  addHidePptCode?: boolean;
  defaultFilter?: any;
  forcePptType?: string;
};

const renderStatus = (record: any) => {
  let color = '#2db7f5'
  if (record.status === 0) {
    color = '#87d068'
  } else if (record.status === 1) {
    color = '#f50'
  }
  return <Tag color={color}>{StatusEnum.toLabel(record.status)}</Tag>
}

const TmplList: React.FC<TmplListProps> = (props) => {
  const {apiRelativeUrls, addHidePptCode, defaultFilter, forcePptType} = props
  const {token} = theme.useToken()
  const {initialState} = useModel('@@initialState')
  const {styles} = useStyles()
  const actionRef = useRef<ActionType>()
  const editRef = createRef<EditAction>()
  const previewRef = createRef<PreviewAction>()
  const slideEditRef = createRef<SlideEditAction>()
  const promptViewRef = createRef<PromptViewAction>()

  const localEditFinish = async () => {
    actionRef.current?.reloadAndRest?.()
  }

  return (
    <ProCard className={styles.container}>
      <ProList<any>
        actionRef={actionRef}
        ghost={true}
        itemCardProps={{
          ghost: true,
        }}
        pagination={{
          defaultPageSize: 8,
          showSizeChanger: false,
        }}
        toolBarRender={() => {
          return [
            <Button
              key='add' type='primary'
              onClick={() => {
                editRef?.current?.show()
              }}
            >
              添加模版
            </Button>,
          ]
        }}
        showActions='always'
        rowSelection={false}
        itemLayout='vertical'
        onItem={(record: any) => {
          return {
            onMouseEnter: () => {
              /*console.log(record)*/
            },
            onClick: () => {
              /*console.log(record)*/
            },
          }
        }}
        metas={{
          title: {
            key: 'keyword',
            // @ts-ignore
            colSize: 3,
            fieldProps: {placeholder: '请输入模版的标题、描述、标签查询'},
            render: (dom, record) => {
              return (
                <Space>
                  {record.title}
                  {renderStatus(record)}
                </Space>
              )
            }
          },
          extra: {
            render: (dom: ReactNode, record: any) => (
              record.coverUrl ?
                <img
                  className={styles.coverImg}
                  alt='cover'
                  src={getDocHttpUrl(record.coverUrl)}
                /> : null
            ),
            search: false
          },
          content: {
            render: (dom, record) => {
              let publish = []
              if (record.publishDate) {
                publish.push(record.publishDate)
              }
              if (record.publisher) {
                publish.push(record.publisher)
              }
              return (
                <div>
                  <Typography.Paragraph
                    title={record.operator?.realName || ''}
                    ellipsis={{
                      rows: 2,
                    }}>{record.operator?.realName || ''}（{PptTypeEnum.toLabel(record.pptType)}）</Typography.Paragraph>
                  <Typography.Paragraph
                    ellipsis={{
                      rows: 2,
                    }}
                    style={{minHeight: '44px'}}
                  >
                    {record.description}
                  </Typography.Paragraph>
                </div>
              )
            },
            search: false
          },
          description: {
            search: false,
            render: (dom, record) => (
              record.tags?.map((_: any) => (<Tag key={_.key}>{_.value}</Tag>))
            ),
          },
          actions: {
            render: (dom, record) => {
              return (
                [
                  <Button
                    key='preview'
                    type='text'
                    icon={
                      <EyeOutlined
                      />
                    }
                    onClick={() => {
                      previewRef?.current?.show({...record})
                    }}
                  >
                    预览
                  </Button>,
                  <Button
                    key='slide-edit'
                    type='text'
                    icon={
                      <HighlightOutlined/>
                    }
                    onClick={() => {
                      slideEditRef?.current?.show({...record})
                    }}
                  >
                    模版制作
                  </Button>,
                  <Button
                    key='edit'
                    type='text'
                    icon={
                      <EditOutlined
                      />
                    }
                    onClick={() => {
                      editRef?.current?.show({...record})
                    }}
                  >
                    编辑
                  </Button>,
                  <Button
                    key='promptView'
                    type='text'
                    icon={
                      <JavaScriptOutlined />
                    }
                    onClick={() => {
                      promptViewRef?.current?.show(record.pptCode)
                    }}
                  >
                    AI个性化提示词
                  </Button>,
                  <Popconfirm
                    key='delete'
                    title='删除模版'
                    description='确定要删除该模版吗？'
                    onConfirm={async () => {
                      let ret = await deletePptInfo(record.pptCode, apiRelativeUrls?.deletePptInfo)
                      if (ret.code !== 0) {
                        errorMessage(`删除失败 ${ret.msg}`)
                        return
                      }
                      successMessage('删除成功')
                      await actionRef.current?.reload?.()
                    }}
                    okText='确定'
                    cancelText='取消'
                  >
                    <Button
                      type='text'
                      danger
                      icon={
                        <DeleteOutlined
                        />
                      }
                    >删除</Button>
                  </Popconfirm>,
                  record.status === 0 ? <Popconfirm
                    title='确定要禁用该模版吗？'
                    onConfirm={async () => {
                      let ret = await disablePptInfo(record.pptCode, apiRelativeUrls?.disablePptInfo)
                      if (ret.code !== 0) {
                        let msg = ret.msg || '禁用失败，请稍后再试'
                        return errorMessage(msg)
                      }
                      successMessage('禁用模版成功')
                      actionRef?.current?.reloadAndRest?.()
                    }}
                    okText='确定'
                    cancelText='取消'
                    key='disable'
                  >
                    <Button
                      type='text'
                      danger
                      icon={
                        <DisconnectOutlined/>
                      }
                    >禁用</Button>
                  </Popconfirm> : null,
                  record.status === 1 ? <Button
                    key='enable'
                    type='text'
                    icon={
                      <SafetyOutlined/>
                    }
                    onClick={async () => {
                      let ret = await enablePptInfo(record.pptCode, apiRelativeUrls?.enablePptInfo)
                      if (ret.code !== 0) {
                        let msg = ret.msg || '启用失败，请稍后再试'
                        return errorMessage(msg)
                      }
                      successMessage('启用模版成功')
                      actionRef?.current?.reloadAndRest?.()
                    }}
                  >
                    启用
                  </Button> : null,
                ]
              )
            },
          },
        }}
        search={{}}
        rowKey='pptCode'
        headerTitle=''
        request={
          async (paramsIn) => {
            let filter = {...paramsIn, ...(defaultFilter || {pptType: ['buildInTmpl', 'platformTmpl', 'userTmpl']})}
            delete filter.current
            delete filter.pageSize

            let data = await getPptInfoList(paramsIn.current, paramsIn.pageSize, filter, {}, apiRelativeUrls?.getPptInfoList)
            return {
              data: data.rows,
              total: data.total,
              success: true
            }
          }
        }
      />
      <Edit ref={editRef} onEditFinish={localEditFinish} apiRelativeUrls={apiRelativeUrls}
            addHidePptCode={addHidePptCode} forcePptType={forcePptType}/>
      <Preview ref={previewRef}/>
      <SlideEdit ref={slideEditRef} onClose={localEditFinish}/>
      <PromptView ref={promptViewRef}/>
    </ProCard>
  )
}

export default TmplList
