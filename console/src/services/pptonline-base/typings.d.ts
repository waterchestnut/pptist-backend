declare namespace PPTONLINEAPI {
  type fullDefinitionModels = {
    /** Operator */
    Operator?: { userCode?: string; realName?: string };
    /** Tag */
    Tag?: { key?: string; value?: string };
  };

  type fullEnumModels = {
    /** CreateTypeEnum */
    CreateTypeEnum?: { manual?: string; ai?: string };
    /** PptTypeEnum */
    PptTypeEnum?: {
      normal?: string;
      buildInTmpl?: string;
      platformTmpl?: string;
      userTmpl?: string;
    };
    /** StatusEnum */
    StatusEnum?: { deleted?: number; normal?: number; disabled?: number };
  };

  type fullParamModels = {
    /** PptInfo */
    PptInfo?: {
      pptCode: string;
      title?: string;
      theme?: Record<string, any>;
      slides?: Record<string, any>[];
      slideIndex?: number;
      viewportSize?: number;
      viewportRatio?: number;
      templates?: Record<string, any>[];
      operator?: { userCode?: string; realName?: string };
      coverUrl?: string;
      status?: -1 | 0 | 1;
      tags?: { key?: string; value?: string }[];
      externalSource?: string;
      createType?: 'manual' | 'ai';
      pptType?: 'normal' | 'buildInTmpl' | 'platformTmpl' | 'userTmpl';
      templateCode?: string;
      description?: string;
    };
    /** IdeologyDetail 课程思政详细信息 */
    IdeologyDetail?: { ragSegmentCode?: string; text?: string; title?: string; url?: string };
  };

  type fullStoreModels = {
    /** PptInfo */
    PptInfo?: {
      pptCode: string;
      title?: string;
      theme?: Record<string, any>;
      slides?: Record<string, any>[];
      slideIndex?: number;
      viewportSize?: number;
      viewportRatio?: number;
      templates?: Record<string, any>[];
      operator?: { userCode?: string; realName?: string; _id?: string };
      coverUrl?: string;
      status?: -1 | 0 | 1;
      tags?: { key?: string; value?: string; _id?: string }[];
      externalSource?: string;
      createType?: 'manual' | 'ai';
      pptType?: 'normal' | 'buildInTmpl' | 'platformTmpl' | 'userTmpl';
      templateCode?: string;
      description?: string;
      insertTime?: string;
      updateTime?: string;
      _id?: string;
    };
  };

  type getPptIpmiDetailParams = {
    pptCode: string;
  };

  type getPptMyDetailParams = {
    pptCode: string;
  };

  type IdeologyDetail = {
    /** 材料片段标识 */
    ragSegmentCode?: string;
    /** 材料摘要 */
    text?: string;
    /** 材料原文标题 */
    title?: string;
    /** 材料原文访问地址 */
    url?: string;
  };

  type PptInfo = {
    /** 课件标识 */
    pptCode: string;
    /** 课件标题 */
    title?: string;
    /** 主题 */
    theme?: Record<string, any>;
    /** 页面数据 */
    slides?: Record<string, any>[];
    /** 页面索引 */
    slideIndex?: number;
    /** 可视区域宽度基数 */
    viewportSize?: number;
    /** 可视区域比例 */
    viewportRatio?: number;
    /** 模版 */
    templates?: Record<string, any>[];
    /** 作者 */
    operator?: { userCode?: string; realName?: string };
    /** 课件封面图 */
    coverUrl?: string;
    /** 状态 */
    status?: -1 | 0 | 1;
    /** 标签 */
    tags?: { key?: string; value?: string }[];
    /** 外部来源标识 */
    externalSource?: string;
    /** 课件添加方式 */
    createType?: 'manual' | 'ai';
    /** 课件类型 */
    pptType?: 'normal' | 'buildInTmpl' | 'platformTmpl' | 'userTmpl';
    /** 课件创建时使用的模版标识 */
    templateCode?: string;
    /** 详细介绍 */
    description?: string;
  };
}
