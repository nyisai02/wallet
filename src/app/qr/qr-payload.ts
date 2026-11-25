import { account } from '../wallet/wallet-model'
import { demoHubs, parseDemoAmount, type DemoHub, type DemoSession } from '../wallet/demo-wallet-api'

export interface QrPayment {
  recipient: string
  amount: string
  provider?: string
  currency?: string
  hub?: DemoHub
}

export function createQrPayload(amount: number | null, session: DemoSession | null = null): string {
  if (session) {
    return JSON.stringify({
      type: 'external',
      msisdn: session.account.mobile,
      dfspId: session.account.payerDfspId,
      hub: session.hub,
      currency: session.currency,
      ...(amount === null ? {} : { amount }),
    })
  }
  return JSON.stringify({
    app: 'MyBank Demo',
    type: 'receive',
    demo: true,
    account: account.number,
    name: account.name,
    currency: 'MMK',
    ...(amount === null ? {} : { amount }),
  })
}

export function readQrPayload(value: string): QrPayment | null {
  if (value.length > 4096) return null
  try {
    const data: unknown = JSON.parse(value)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const code = data as Record<string, unknown>
    const hub = typeof code['hub'] === 'string' ? code['hub'].toLowerCase() : ''
    const route = demoHubs.find(item => item.id === hub)
    if (route && code['type'] !== 'internal') {
      const recipient = code['msisdn']
      const provider = code['dfspId']
      const currency = code['currency']
      const amount = code['amount'] === undefined ? '' : String(code['amount'])
      if (typeof recipient !== 'string' || !/^\+?\d{5,15}$/.test(recipient) ||
          typeof provider !== 'string' || !provider.trim() || provider.length > 128 ||
          typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) ||
          (amount && parseDemoAmount(amount) === null)) return null
      return { recipient, amount, provider, currency, hub: route.id }
    }
    if (
      code['app'] !== 'MyBank Demo' ||
      code['demo'] !== true ||
      code['type'] !== 'receive' ||
      code['currency'] !== 'MMK' ||
      typeof code['name'] !== 'string' ||
      !code['name'].trim() ||
      code['name'].length > 80 ||
      typeof code['account'] !== 'string' ||
      !/^\d{6,24}$/.test(code['account'])
    ) return null

    const amount = code['amount']
    if (amount !== undefined && (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0)) return null

    return {
      recipient: code['name'].trim() + ' · ' + code['account'],
      amount: amount === undefined ? '' : String(amount),
    }
  } catch {
    return null
  }
}
