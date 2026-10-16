// Parse req[source] with a zod schema; parsed values land on req.valid[source].
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) return next(result.error);
  req.valid = { ...(req.valid || {}), [source]: result.data };
  return next();
};
