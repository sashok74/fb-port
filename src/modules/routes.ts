import { Request, Response, Router } from 'express';
import { QueryOpen, TransactionReadType, IoptQuery } from './db.js';

const routes = Router();

interface TypeHandlers {
  [key: string]: (value: string) => any;
}

const addprm = (p: unknown, prm: unknown[]) => {
  if (p) {
    prm.push(p);
  } else {
    prm.push('null');
  }
};

const queryOpt: IoptQuery = {
  TransactionReadType: TransactionReadType.READ_ONLY,
  ttl: 1000 * 60 * 60,
};

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

/* полные метаданные по процедуре */
routes.get("/Proc", async (req, res) => {
  const prm: undefined[] = [];
  const { name } = req.query;
  addprm(name, prm);

  try {
    const proc_info = await QueryOpen(
      "select * from met$proc_info_s(?)",
      prm,
      queryOpt,
    );
    const fields_info = await QueryOpen(
      "select * from met$proc_field_info_s(?)",
      prm,
      queryOpt,
    );
    return res.status(201).json({
      PROC_INFO: proc_info[0],
      FIELDS_INFO: fields_info,
    });
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: "Proc",
      sqlprm: prm,
    });
  }
});

routes.post("/query", async (req: Request, res: Response) => {
  //const query = req.body.query;
  const procedureName = req.body.procedureName;
  const queryParams = req.body.prm;
  const transType = req.body.transactonType;
  const prm: undefined[] = [];
  let params: { PARAM_NAME: string; PARAM_TYPE: string }[] = [];
  prm.push(procedureName);
  console.log(prm);
  try {
    const res = await QueryOpen(
      "select trim(param_name) as PARAM_NAME, trim (param_type) as PARAM_TYPE from met$proc_field_info_s(?) where in_param = 0 and param_name not like '%_SELECT_TEXT%' order by param_number",
      prm,
      queryOpt,
    );
    params = (res as { PARAM_NAME: string; PARAM_TYPE: string }[]).map((item) =>
      item
    );
  } catch (err: any) {
    res.status(500).json({
      sqlerror: err.message,
      pros: "met$proc_field_info_s",
      sqlprm: prm,
    });
  }

  const placeholders: string = Array(params.length).fill("?").join(", ");
  const query_text = `select * from ${procedureName} (${placeholders})`;
  console.log(query_text);
  console.log(queryParams);

  const typeHandlers: TypeHandlers = {
    DATE: (value: string) => new Date(Date.parse(value)),
    // Добавьте обработчики для других типов параметров, если необходимо.
    DEFAULT: (value: string) => value,
  };

  try {
    const fieldValues: (undefined)[] = params.map((p) => {
      const paramName = p.PARAM_NAME;
      const paramValue = queryParams[paramName];
      if (!paramValue) return null;
      const handler = typeHandlers[p.PARAM_TYPE] || typeHandlers.DEFAULT;
      return handler(paramValue);
    });
    QueryOpen(query_text, fieldValues, transType)
      .then((result: object[]) => res.status(201).json(result))
      .catch((err) =>
        res.status(500).json({
          sqlerror: err.message,
          proc: query_text,
          sqlprm: fieldValues,
        })
      );
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export default routes;
