// @ts-ignore
import { Request, Response } from 'express';

export default {
  'POST /llm/gen-ppt-syllabus': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /llm/gen-ppt-syllabus/stream': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /llm/ideology': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /llm/gen-ppt': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /llm/gen-ppt/stream': (req: Request, res: Response) => {
    res.status(200).send({});
  },
};
