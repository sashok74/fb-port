import { Request, Response, Router } from 'express';
import { QueryOpen, TransactionReadType, IoptQuery } from './db.js';

const routes = Router();

interface TypeHandlers {
  [key: string]: (value: string) => any;
}

const addprm = (p: unknown, prm: unknown[]) => prm.push(p ?? 'null');

const queryOpt: IoptQuery = {
  TransactionReadType: TransactionReadType.READ_ONLY,
  ttl: 1000 * 60 * 60,
};

routes.get('/ProcList', async (req, res) => {
  try {
    const result = await QueryOpen('select proc_name from met$proc_info', [], queryOpt);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ sqlerror: err.message, pros: 'met$proc_info' });
  }
});

routes.get('/ProcInfo', async (req, res) => {
  const prm: unknown[] = [req.query.name];
  try {
    const result = await QueryOpen('select * from met$proc_info_s(?)', prm, queryOpt);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: 'met$proc_info_s',
      sqlprm: prm,
    });
  }
});

routes.get('/ProcPrmInfo', async (req, res) => {
  const prm: unknown[] = [req.query.name];
  try {
    const result = await QueryOpen('select * from met$proc_field_info_s(?)', prm, queryOpt);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: 'met$proc_field_info_s',
      sqlprm: prm,
    });
  }
});


/* полные метаданные по процедуре */
routes.get('/Proc', async (req, res) => {
  const prm: unknown[] = [req.query.name];
  try {
    const [proc_info, fields_info, proc_to_proc] = await Promise.all([
      QueryOpen('select * from met$proc_info_s(?)', prm, queryOpt),
      QueryOpen('select * from met$proc_field_info_s(?)', prm, queryOpt),
      QueryOpen('select * from met$proc_to_proc_s(?)', prm, queryOpt),
    ]);
    const proc_to_proc_prm_promises = (proc_to_proc as { [key: string]: any }[]).map(async (item: { [key: string]: any }) => {
      const proc_to_proc_prm = await QueryOpen('select * from met$proc_to_proc_param_s(?)', [item.PROC_TO_PROC_ID], queryOpt);
      return { ...item, PROC_TO_PROC_PRM: proc_to_proc_prm };
    });
    const proc_to_proc_prm_results = await Promise.all(proc_to_proc_prm_promises );

    res.status(201).json({
      PROC_INFO: proc_info.length > 0 ? proc_info[0] : {},
      FIELDS_INFO: fields_info,
      PROC_TO_PROC: proc_to_proc_prm_results,
    });
    // для каждого proc_to_proc получим связь параметров.
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: 'Proc',
      sqlprm: prm,
    });
  }
});

routes.post('/query', async (req: Request, res: Response) => {
  //const query = req.body.query;
  const procedureName = req.body.procedureName;
  const queryParams = req.body.prm;
  const transType = req.body.transactonType;
  const prm: unknown[] = [];
  let params: { PARAM_NAME: string; PARAM_TYPE: string }[] = [];
  prm.push(procedureName);
  console.log(prm);
  try {
    const fieldInfoQuery = `
      select trim(param_name) as PARAM_NAME, trim (param_type) as PARAM_TYPE
      from met$proc_in_param_info_s(?)
      order by param_number
    `;
    const fieldInfoParams = prm;
    const fieldInfoOptions = queryOpt;

    const fieldInfoResult = await QueryOpen(fieldInfoQuery, fieldInfoParams, fieldInfoOptions);
    params = (fieldInfoResult as { PARAM_NAME: string; PARAM_TYPE: string }[]).map((item) => item);
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      proc: 'met$proc_field_info_s',
      sqlprm: prm,
    });
    return;
  }

  const placeholders: string = Array(params.length).fill('?').join(', ');
  const query_text = `select * from ${procedureName.trim()} (${placeholders})`;
  console.log(query_text);
  console.log(queryParams);

  const typeHandlers: TypeHandlers = {
    DATE: (value: string) => new Date(Date.parse(value)),
    // Добавьте обработчики для других типов параметров, если необходимо.
    DEFAULT: (value: string) => value,
  };
  let fieldValues: (undefined)[] | null = null;
  try {
    fieldValues = params.map((p) => {
      const paramName = p.PARAM_NAME;
      const paramValue = queryParams[paramName];
      if (!paramValue) return null;
      const handler = typeHandlers[p.PARAM_TYPE] || typeHandlers.DEFAULT;
      return handler(paramValue);
    });

    const result = await QueryOpen(query_text, fieldValues, transType);
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      sqlerror: err.message,
      proc: query_text,
      sqlprm: fieldValues,
    });
  }
});

export default routes;
