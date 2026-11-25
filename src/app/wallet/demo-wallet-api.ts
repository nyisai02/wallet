import type { Transaction } from './wallet-model'

export const demoHubs = [
  { id: 'vnow', name: 'Mojaloop vNow' },
  { id: 'lcc', name: 'LCC' },
  { id: 'thitsaconnect', name: 'ThitsaConnect' },
] as const

export type DemoHub = typeof demoHubs[number]['id']
export type PartyIdType = 'MSISDN' | 'ACCOUNT_ID'
type ApiMoney = string | number

export interface DemoAccount {
  userId: string
  displayName: string
  mobile: string
  payerDfspId: string
  amount: ApiMoney
}

interface LedgerEntry {
  amount: ApiMoney
  transactionType: string
  actionType: string
  transactionDate: string
}

interface Posting {
  transactionId: number | string
  balanceAfter: ApiMoney
  amount: ApiMoney
}

interface TransferResponse {
  transferId: string
  amount: ApiMoney
  currentState?: string
  quoteResponse?: {
    body?: {
      payeeReceiveAmount?: { amount: ApiMoney; currency: string }
    }
  }
}

interface PayeeLookup {
  transferId: string
  to: {
    firstName?: string
    lastName?: string
    displayName?: string
    name?: string
    partyIdInfo?: { fspId?: string }
    fspId?: string
  }
}

export interface Recipient {
  provider: string
  idType: PartyIdType
  identifier: string
  subId: string
}

export interface DemoSession {
  account: DemoAccount
  hub: DemoHub
  currency: string
}

interface TransferStatus {
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  postingSuccess?: boolean
}

export class DemoWalletApiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message)
  }
}

async function request<T>(path: string, method = 'GET', body?: object, headers?: Record<string, string>): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/' + path, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw new DemoWalletApiError('Demo Wallet API is unavailable or timed out.')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new DemoWalletApiError(data?.message || data?.errorInformation?.errorDescription ||
      'Demo Wallet API returned HTTP ' + response.status + '.', response.status)
  }
  if (data === null) throw new DemoWalletApiError('Demo Wallet API returned an invalid response.')
  return data as T
}

function payerHeaders({ account }: DemoSession): Record<string, string> {
  return {
    idtype: 'MSISDN',
    payermsisdn: account.mobile,
    payerdfspid: account.payerDfspId,
    'payer.peer': account.payerDfspId,
  }
}

export const demoWalletApi = {
  account: (mobile: string) => request<DemoAccount>('find_user_quote?mobile=' + encodeURIComponent(mobile), 'POST'),
  history: (mobile: string) => request<LedgerEntry[]>('get_user_history?mobile=' + encodeURIComponent(mobile)),
  currencies: () => request<{ currency_list: { currencyId: string }[] }>('get_all_currency'),
  providers: () => request<{ dfsp_list: { dfspCode: string }[] }>('get_all_dfsp'),
  cash: (session: DemoSession, action: 'topUp' | 'withdraw', amount: number) =>
    request<Posting>(action === 'topUp' ? 'credit_amount' : 'debit', 'POST', {
      mobile: session.account.mobile,
      currency: session.currency,
      amount,
      is_cash: true,
    }),
  lookup: (session: DemoSession, recipient: Recipient, amount: number) =>
    request<PayeeLookup>('lookup_payee_' + session.hub, 'POST', {
      idType: recipient.idType,
      ...(recipient.idType === 'MSISDN' ? { msisdn: recipient.identifier } : {
        accountid: recipient.identifier,
        ...(recipient.subId ? { msisdn: recipient.subId } : {}),
      }),
      dfspId: recipient.provider,
      currency: session.currency,
      ...(session.hub === 'vnow' ? { amount: String(amount) } : {}),
    }, payerHeaders(session)),
  quote: (session: DemoSession, transferId: string, amount: number) =>
    request<TransferResponse>('submit_quote_' + session.hub, 'POST', {
      transferId, amount, currency: session.currency, acceptParty: true,
    }, payerHeaders(session)),
  confirm: (session: DemoSession, transferId: string) =>
    request<TransferResponse>('confirm_transfer_' + session.hub, 'POST', {
      transferId, acceptQuote: true,
    }, payerHeaders(session)),
  status: (transferId: string) =>
    request<TransferStatus>('transaction_status?mojaloopTransferId=' + encodeURIComponent(transferId)),
}

export function apiAmount(value: ApiMoney): number {
  const amount = Number(value)
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' ||
      !Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) {
    throw new DemoWalletApiError('Demo Wallet API returned an invalid amount.')
  }
  return amount
}

export function parseDemoAmount(value: string): number | null {
  const input = value.trim()
  const amount = Number(input)
  return /^\d+(?:\.\d{1,4})?$/.test(input) && amount > 0 &&
    Number.isSafeInteger(Math.round(amount * 10_000)) ? amount : null
}

export function ledgerTransactions(entries: LedgerEntry[], currency: string): Transaction[] {
  if (!Array.isArray(entries)) throw new DemoWalletApiError('Demo Wallet API returned an invalid history.')
  return entries.map((entry, index) => {
    const incoming = entry.transactionType === 'CREDIT'
    const category = entry.actionType === 'DEPOSIT' ? 'Deposit' : entry.actionType === 'WITHDRAW' ? 'Withdrawal' :
      incoming ? 'Money received' : 'Money sent'
    // The history controller adds 06:30 to ledger timestamps before returning them.
    const date = Date.parse(entry.transactionDate.replace(' ', 'T') + '+06:30')
    if (!Number.isFinite(date) || (!incoming && entry.transactionType !== 'DEBIT')) {
      throw new DemoWalletApiError('Demo Wallet API returned an invalid history entry.')
    }
    return {
      id: 'ledger-' + index,
      reference: null,
      name: category,
      category,
      date,
      amount: Math.abs(apiAmount(entry.amount)) * (incoming ? 1 : -1),
      icon: incoming ? 'arrow-down-left' : 'arrow-up-right',
      currency,
    }
  })
}
