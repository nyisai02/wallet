import { account } from '../wallet/wallet-model'

export interface QrPayment {
  recipient: string
  amount: string
}

export function createQrPayload(amount: number | null): string {
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
