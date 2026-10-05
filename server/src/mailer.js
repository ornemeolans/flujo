// Envío de emails vía Resend (https://resend.com) usando su API HTTP.
// Sin RESEND_API_KEY (desarrollo) el email se imprime en la consola.
export function createMailer({ apiKey, from }) {
  if (!apiKey) {
    return async ({ to, subject, text }) => {
      console.log(`\n📧 [email no enviado: falta RESEND_API_KEY]\nPara: ${to}\nAsunto: ${subject}\n${text}\n`)
    }
  }
  return async ({ to, subject, text, html }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, html }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function actionEmail({ title, intro, cta, url, outro }) {
  return {
    text: `${intro}\n\n${cta}: ${url}\n\n${outro}`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#17222D;font-family:Arial,sans-serif;color:#e8f0f4">
  <div style="max-width:480px;margin:0 auto;background:#1e2e3d;border-radius:14px;padding:28px">
    <div style="font-family:Georgia,serif;font-size:28px;margin-bottom:16px">flu<span style="color:#94DFBD">jo</span></div>
    <h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
    <p style="font-size:14px;line-height:1.6;color:#b9cbd3">${esc(intro)}</p>
    <p style="margin:24px 0"><a href="${esc(url)}" style="background:#94DFBD;color:#17222D;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">${esc(cta)}</a></p>
    <p style="font-size:12px;line-height:1.6;color:#709AA8">${esc(outro)}</p>
  </div>
</body></html>`,
  }
}
