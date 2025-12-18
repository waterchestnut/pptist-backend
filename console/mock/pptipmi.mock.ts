// @ts-ignore
import { Request, Response } from 'express';

export default {
  'POST /ppt/ipmi/list': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'GET /ppt/ipmi/detail': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /ppt/ipmi/update': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /ppt/ipmi/delete': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /ppt/ipmi/enable': (req: Request, res: Response) => {
    res.status(200).send({});
  },
  'POST /ppt/ipmi/disable': (req: Request, res: Response) => {
    res.status(200).send({});
  },
};
