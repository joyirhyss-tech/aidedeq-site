const SUPABASE_URL = process.env.CRM_SUPABASE_URL;
const SUPABASE_KEY = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;

function createClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase is not configured (CRM_SUPABASE_URL / CRM_SUPABASE_SERVICE_ROLE_KEY).');
  }

  return {
    from(table) {
      let path = `${SUPABASE_URL}/rest/v1/${table}`;
      const queryParts = [];
      let method = 'GET';
      let bodyData = null;
      let preferHeader = null;
      let selectColumns = null;
      let isSingle = false;

      const headers = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      };

      const builder = {
        select(columns) {
          selectColumns = columns;
          return builder;
        },
        insert(data) {
          method = 'POST';
          bodyData = data;
          preferHeader = 'return=representation';
          return builder;
        },
        update(data) {
          method = 'PATCH';
          bodyData = data;
          preferHeader = 'return=representation';
          return builder;
        },
        eq(column, value) {
          queryParts.push(`${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`);
          return builder;
        },
        order(column, opts = {}) {
          const dir = opts.ascending === false ? 'desc' : 'asc';
          queryParts.push(`order=${encodeURIComponent(column)}.${dir}`);
          return builder;
        },
        limit(n) {
          queryParts.push(`limit=${n}`);
          return builder;
        },
        single() {
          isSingle = true;
          queryParts.push('limit=1');
          if (preferHeader) {
            preferHeader += ',count=exact';
          }
          return builder;
        },
        async then(resolve, reject) {
          try {
            if (selectColumns) {
              queryParts.push(`select=${encodeURIComponent(selectColumns)}`);
            }

            const url = queryParts.length > 0 ? `${path}?${queryParts.join('&')}` : path;

            if (preferHeader) {
              headers.Prefer = preferHeader;
            }

            const response = await fetch(url, {
              method,
              headers,
              body: bodyData ? JSON.stringify(bodyData) : undefined,
            });

            if (!response.ok) {
              const errorText = await response.text();
              return resolve({ data: null, error: { message: errorText } });
            }

            if (response.status === 204) {
              return resolve({ data: null, error: null });
            }

            const data = await response.json();

            if (isSingle) {
              return resolve({
                data: Array.isArray(data) ? data[0] || null : data,
                error: null,
              });
            }

            return resolve({ data, error: null });
          } catch (err) {
            if (reject) return reject(err);
            return resolve({ data: null, error: { message: err.message } });
          }
        },
      };

      return builder;
    },
  };
}

module.exports = { createClient };
