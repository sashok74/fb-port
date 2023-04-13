import { Request, Response, Router } from 'express';
import { QueryOpen, TransactionReadType, IoptQuery } from './db.js';

const routes = Router();

const addprm = (p: any, prm: any[]) => {
  if (p) {
    prm.push(p);
  } else {
    prm.push('null');
  }
};


const queryOpt:IoptQuery = {
  TransactionReadType: TransactionReadType.READ_ONLY,
  ttl: 1000 * 60 * 60,
}

routes.get('/ProcList', (req, res) => {
  QueryOpen('select proc_name from met$proc_info', [], queryOpt)
    .then((result) => res.status(201).json(result))
    .catch((err) => res.status(500).json({ sqlerror: err.message, pros: 'met$proc_info' }));
});

routes.get('/ProcInfo', (req, res) => {
  const prm: undefined[] = [];
  const { name } = req.query;
  addprm(name, prm);
  QueryOpen('select * from met$proc_info_s(?)', prm, queryOpt)
    .then((result) => res.status(201).json(result))
    .catch((err) =>
      res.status(500).json({
        sqlerror: err.message,
        pros: 'met$proc_info_s',
        sqlprm: prm,
      }),
    );
});

routes.get('/ProcPrmInfo', (req, res) => {
  const prm: undefined[] = [];
  const { name } = req.query;
  addprm(name, prm);
  QueryOpen('select * from met$proc_field_info_s(?)', prm, queryOpt)
    .then((result) => res.status(201).json(result))
    .catch((err) =>
      res.status(500).json({
        sqlerror: err.message,
        pros: 'met$proc_field_info_s',
        sqlprm: prm,
      }),
    );
});

routes.post('/query', async (req: Request, res: Response) => {
  //const query = req.body.query;
  const procedureName = req.body.procedureName;
  const queryParams = req.body.prm;
  const transType = req.body.transactonType; 
  const prm: undefined[] = [];
  let params: string[] = [];
  prm.push(procedureName);
  console.log(prm);
  try {
    const res = await QueryOpen(
      'select trim(param_name) PARAM_NAME from met$proc_field_info_s(?) where in_param = 0 order by param_number',
      prm,
      queryOpt,
    );
    params = (res as { PARAM_NAME: string }[]).map((item) => item.PARAM_NAME);
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: 'met$proc_field_info_s',
      sqlprm: prm,
    });
  }

  const placeholders: string = Array(params.length).fill('?').join(', ');
  const query_text = `select * from ${procedureName} (${placeholders})`;
  console.log(query_text);
  console.log(queryParams);
  try {
    const fieldValues: (any | null)[] = params.map((p) => queryParams[p] ?? null);
    QueryOpen(query_text, fieldValues, transType)
      .then((result) => res.status(201).json(result))
      .catch((err) =>
        res.status(500).json({
          sqlerror: err.message,
          pros: 'met$proc_field_info_s',
          sqlprm: fieldValues,
        }),
      );
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export default routes;
