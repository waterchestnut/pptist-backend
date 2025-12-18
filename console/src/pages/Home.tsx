import {PageContainer} from '@ant-design/pro-components'
import {useModel} from '@umijs/max'
import {Card, theme} from 'antd'
import React from 'react'

const Home: React.FC = () => {
  const {token} = theme.useToken()
  const {initialState} = useModel('@@initialState')
  return (
    <PageContainer>
      <Card
        style={{
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: '20px',
            color: token.colorTextHeading,
          }}
        >
          欢迎使用在线课件平台
        </div>
      </Card>
    </PageContainer>
  )
}

export default Home
