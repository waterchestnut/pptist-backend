import {PageContainer} from '@ant-design/pro-components'
import {history, useModel} from '@umijs/max'
import {Button, Card, Col, Row, Space, Typography, theme} from 'antd'
import {
  BlockOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  RightOutlined,
} from '@ant-design/icons'
import React from 'react'
import {checkPermissions} from '@/utils/authority'

const {Paragraph} = Typography

/** 按小时段的问候语 */
const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/** 中文长日期，不引入 dayjs 依赖 */
const formatDate = () => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`
}

interface EntryItem {
  title: string;
  desc: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  authority: string[];
}

const ENTRIES: EntryItem[] = [
  {title: 'PPT 广场', desc: '浏览平台共享的课件，查看与复用', path: '/ppt/list', icon: <FileTextOutlined/>, color: '#1677ff', authority: ['pptonline-ppt-ipmi']},
  {title: '我的 PPT', desc: '创建、编辑课件，管理分享与权限', path: '/my-ppt/list', icon: <EditOutlined/>, color: '#fa8c16', authority: ['pptonline-ppt-my']},
  {title: '模板广场', desc: '浏览平台幻灯片模板与设计素材', path: '/tmpl/list', icon: <BlockOutlined/>, color: '#722ed1', authority: ['pptonline-tmpl-ipmi']},
  {title: '我的模板', desc: '维护个人模板资产与版本', path: '/my-tmpl/list', icon: <FolderOpenOutlined/>, color: '#13c2c2', authority: ['pptonline-tmpl-my']},
]

const Home: React.FC = () => {
  const {token} = theme.useToken()
  const {initialState} = useModel('@@initialState')
  const currentUser = initialState?.currentUser
  const userName = currentUser?.realName || currentUser?.nickName || currentUser?.userCode || ''

  const privs = currentUser?.privs as string[] | undefined
  const entries = ENTRIES.filter((entry) => checkPermissions(entry.authority, privs))
  const canMyPpt = checkPermissions(['pptonline-ppt-my'], privs)

  return (
    <PageContainer
      header={{title: null, breadcrumb: {}}}
    >
      {/* 欢迎横幅 */}
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 16,
          background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 55%, ${token.colorFillQuaternary} 100%)`,
        }}
        styles={{body: {padding: '24px 28px'}}}
      >
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col flex="auto">
            <div style={{fontSize: 22, fontWeight: 600, marginBottom: 6}}>
              {getGreeting()}，{userName}
            </div>
            <div style={{color: token.colorTextSecondary}}>
              {formatDate()} · 在线课件平台：从模板到成稿，创作、分享与协作一站完成
            </div>
          </Col>
          <Col flex="none">
            <Space>
              {canMyPpt && (
                <Button type="primary" icon={<EditOutlined/>} onClick={() => history.push('/my-ppt/list')}>
                  我的课件
                </Button>
              )}
              <Button icon={<FileTextOutlined/>} onClick={() => history.push('/ppt/list')}>
                PPT 广场
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 功能入口 */}
      <Row gutter={[16, 16]}>
        {entries.map((entry) => (
          <Col key={entry.path} xs={24} sm={12} xl={6}>
            <Card
              hoverable
              onClick={() => history.push(entry.path)}
              style={{borderRadius: 12, height: '100%'}}
              styles={{body: {padding: 20}}}
            >
              <div style={{display: 'flex', gap: 14, alignItems: 'flex-start'}}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: entry.color,
                    background: `${entry.color}1a`,
                  }}
                >
                  {entry.icon}
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontWeight: 500, fontSize: 15, marginBottom: 4}}>
                    {entry.title} <RightOutlined style={{fontSize: 11, color: token.colorTextQuaternary}}/>
                  </div>
                  <Paragraph type="secondary" style={{fontSize: 13, marginBottom: 0}} ellipsis={{rows: 2}}>
                    {entry.desc}
                  </Paragraph>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </PageContainer>
  )
}

export default Home
