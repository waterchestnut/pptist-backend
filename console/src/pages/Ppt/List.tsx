import {ActionType, PageContainer, ProCard, ProList} from '@ant-design/pro-components'
import {useModel} from '@umijs/max'
import {Button, Card, Popconfirm, Tag, Typography, theme, Space, Input} from 'antd'
import React, {createRef, ReactNode, useRef, useState} from 'react'
import {createStyles} from 'antd-style'
import {errorMessage, successMessage} from '@/utils/msg'
import {
  DeleteOutlined,
  EyeOutlined,
  HighlightOutlined, UploadOutlined,
} from '@ant-design/icons'
import {addPptInfo, deletePptInfo, getPptInfoList, importPptx} from '@/services/pptonline/pptInfo'
import {getDocHttpUrl, getDownloadUrl, uuidV4} from '@/utils/util'
import Preview, {PreviewAction} from '../Tmpl/components/Preview'
import SlideEdit, {SlideEditAction} from '../Tmpl/components/SlideEdit'
import {getAccessToken} from '@/utils/authority'
import {simpleUploadFile} from '@/services/doc/fileInfo'

const useStyles = createStyles(({token, css}) => {
  return {
    container: {
      '.ant-pro-list-row': {
        paddingInline: '8px'
      },
      '.ant-pro-list-row-actions .anticon': {
        marginRight: '8px'
      },
      '.ant-pro-checkcard:hover': {
        cursor: 'default'
      },
      '.ant-pro-checkcard-content': {
        padding: 0
      },
      '.ant-pro-checkcard-header, .ant-pro-checkcard-header-left, .ant-pro-checkcard-title': {
        display: 'block',
        width: '100%'
      }
    },
    coverContainer: css`
      width: 100%;
      aspect-ratio: 16 / 9;
    `,
    coverImg: css`
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
      object-fit: contain;
      border-bottom: 1px solid #d9d9d9;
      width: 100%;
      max-height: 100%;
    `
  }
})

export type PptListProps = {
  apiRelativeUrls?: any;
  defaultFilter?: any;
};

const renderCover = (pptInfo: any, styles: any) => {
  if (pptInfo.coverUrl || pptInfo.firstSlideImgUrl) {
    return (
      <img
        className={styles.coverImg}
        alt='cover'
        src={getDocHttpUrl(pptInfo.firstSlideImgUrl || pptInfo.coverUrl)}
      />
    )
  }

  return (
    <iframe
      id={`cover-iframe-${pptInfo.pptCode}`}
      style={{width: '100%', height: 'calc(100%)', overflow: 'hidden'}}
      className={styles.coverImg}
      onLoad={() => {
      }}
      // @ts-ignore
      src={`${PPTONLINE_PLATFORM_BASE}/first-slide?pptCode=${pptInfo.pptCode}&accessToken=${getAccessToken()}`}
      width='100%'
      height='100%'
      scrolling='no'
      frameBorder='0'
    />
  )
}

const PptList: React.FC<PptListProps> = (props) => {
  const {apiRelativeUrls, defaultFilter} = props
  const {token} = theme.useToken()
  const {initialState} = useModel('@@initialState')
  const {styles} = useStyles()
  const actionRef = useRef<ActionType>()
  const previewRef = createRef<PreviewAction>()
  const slideEditRef = createRef<SlideEditAction>()
  const [adding, setAdding] = useState(false)

  const localEditFinish = async () => {
    actionRef.current?.reloadAndRest?.()
  }

  const addEmptyPpt = async () => {
    let formData = {
      title: '空白课件',
      pptType: 'alone',
      slides: [
        {
          id: uuidV4(),
          elements: []
        }
      ]
    }
    setAdding(true)
    let ret = await addPptInfo(formData, apiRelativeUrls?.addPptInfo)
    setAdding(false)
    if (ret.code !== 0) {
      let msg = ret.msg || '添加失败，请稍后再试'
      return errorMessage(msg)
    }
    successMessage('添加成功，请点击课件制作按钮进行课件制作')
    await localEditFinish()
  }

  const handleImportFileChange = async (event: any) => {
    const file = event.target.files?.[0]
    /*console.log(file.type, file)
    return*/
    if (!file || adding) {
      return
    }
    if (file.type !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      errorMessage('文件格式不正确')
      return
    }
    setAdding(true)
    let fileRet = await simpleUploadFile(file)
    if (fileRet.code !== 0) {
      errorMessage(`文件上传失败 ${fileRet.msg}`)
      setAdding(false)
      return
    }
    let title = fileRet.data.fileName.replaceAll(/.pptx/ig, '')
    let fileUrl = getDownloadUrl(fileRet.data.fileCode, fileRet.data.fileName)
    let ret = await importPptx({
      fileUrl,
      options: {title, pptType: 'alone'}
    })
    setAdding(false)
    if (ret.code !== 0) {
      errorMessage(`导入失败 ${ret.msg}`)
      return
    }
    successMessage('导入成功，您可以点击课件制作按钮继续课件制作')
    await actionRef.current?.reload?.()
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
        showActions='always'
        toolBarRender={() => {
          return [
            <div>
              <label htmlFor='importFileInput' title='选择本地PPTX文件'>
                <a><UploadOutlined
                  style={{marginRight: '8px'}}/>从本地PPTX导入课件</a>
              </label>
              <Input disabled={adding} accept='.pptx' type='file' id='importFileInput' onChange={handleImportFileChange}
                     style={{display: 'none'}}/>
            </div>,
            <Button
              key='add' type='primary'
              onClick={() => {
                if (adding) {
                  return
                }
                addEmptyPpt()
              }}
              loading={adding}
            >
              添加空白课件
            </Button>,
          ]
        }}
        rowSelection={false}
        grid={{gutter: 16, column: 4}}
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
            fieldProps: {placeholder: '请输入课件的标题查询'},
            render: (dom: ReactNode, record: any) => {
              return (
                <div className={styles.coverContainer}>
                  {
                    renderCover(record, styles)
                  }
                </div>
              )
            },
          },
          content: {
            render: (dom, record) => {
              return (
                <div>
                  <Typography.Title
                    ellipsis={{
                      rows: 2,
                    }}
                    style={{minHeight: '48px', margin: 0}}
                    level={5}
                    title={record.title}
                  >
                    {record.title}
                  </Typography.Title>
                </div>
              )
            },
            search: false
          },
          actions: {
            cardActionProps: 'actions',
            render: (dom, record) => {
              return (
                [
                  <a
                    key='preview'
                    onClick={() => {
                      previewRef?.current?.show({...record})
                    }}
                  >
                    <EyeOutlined
                    />
                    预览
                  </a>,
                  <a
                    key='slide-edit'
                    onClick={() => {
                      slideEditRef?.current?.show({...record})
                    }}
                  >
                    <HighlightOutlined/>
                    课件制作
                  </a>,
                  <Popconfirm
                    key='delete'
                    title='删除课件'
                    description='确定要删除该课件吗？'
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
                    <a><DeleteOutlined/>删除</a>
                  </Popconfirm>,
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
            let filter = {...paramsIn, ...(defaultFilter || {pptType: 'alone'})}
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
      <Preview ref={previewRef} title='课件预览'/>
      <SlideEdit ref={slideEditRef} onClose={localEditFinish} title='课件制作'/>
    </ProCard>
  )
}

export default PptList
