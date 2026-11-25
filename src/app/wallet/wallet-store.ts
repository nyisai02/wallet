import { computed, Injectable, signal } from '@angular/core'
import {
  apiAmount, demoWalletApi, DemoWalletApiError, ledgerTransactions, parseDemoAmount,
  type DemoHub, type DemoSession, type Recipient,
} from './demo-wallet-api'
import { account, actions, createDemoWallet, postTransfer, reviewTransfer, type Action, type Draft, type Transaction } from './wallet-model'

export interface WalletDraft extends Draft {
  transferId?: string
  provider?: string
  receiveAmount?: { amount: number; currency: string }
}

export interface PaymentReceipt extends Transaction {
  transferId?: string
  detail?: string
}

@Injectable({ providedIn: 'root' })
export class WalletStore {
  private readonly state = signal(createDemoWallet())
  private readonly demoSession = signal<DemoSession | null>(null)
  private readonly standalone = signal(false)
  private readonly pending = signal<PaymentReceipt[]>([])
  readonly session = this.demoSession.asReadonly()
  readonly preview = this.standalone.asReadonly()
  readonly pendingTransfers = this.pending.asReadonly()
  readonly wallet = this.state.asReadonly()
  readonly currency = computed(() => this.session()?.currency ?? 'MMK')
  readonly account = computed(() => {
    const profile = this.session()?.account
    return profile ? {
      name: profile.displayName,
      number: profile.mobile,
      formattedNumber: profile.mobile,
      cardSuffix: profile.mobile.slice(-4),
    } : account
  })

  async connect(mobile: string, currency: string, hub: DemoHub): Promise<void> {
    const profile = await demoWalletApi.account(mobile)
    if (!profile.mobile || !profile.displayName || !profile.payerDfspId) {
      throw new Error('Demo Wallet account is missing its mobile number, name or DFSP ID.')
    }
    const [{ currency_list }, entries] = await Promise.all([
      demoWalletApi.currencies(), demoWalletApi.history(profile.mobile),
    ])
    if (!Array.isArray(currency_list) || !currency_list.some(item => item.currencyId === currency)) {
      throw new Error(currency + ' is unavailable on this Demo Wallet server.')
    }
    const transactions = ledgerTransactions(entries, currency)
    this.state.set({ balance: apiAmount(profile.amount), transactions, savings: 0, frozen: false })
    this.demoSession.set({ account: profile, currency, hub })
    this.standalone.set(false)
  }

  openPreview(): void {
    this.state.set(createDemoWallet())
    this.standalone.set(true)
  }

  disconnect(): void {
    this.demoSession.set(null)
    this.standalone.set(false)
    this.pending.set([])
  }

  async refresh(): Promise<void> {
    const session = this.session()
    if (!session) return
    const { mobile } = session.account
    const [profile, entries] = await Promise.all([demoWalletApi.account(mobile), demoWalletApi.history(mobile)])
    if (this.session() !== session) return
    this.state.update(wallet => ({
      ...wallet,
      balance: apiAmount(profile.amount),
      transactions: ledgerTransactions(entries, session.currency),
    }))
  }

  async providers(): Promise<string[]> {
    const { dfsp_list } = await demoWalletApi.providers()
    if (!Array.isArray(dfsp_list)) throw new Error('Demo Wallet API returned an invalid provider list.')
    return [...new Set(dfsp_list.map(({ dfspCode }) => dfspCode).filter(Boolean))].sort()
  }

  async review(action: Action, amountInput: string, target: string, recipient?: Recipient): Promise<WalletDraft> {
    const session = this.session()
    if (!session) {
      const result = reviewTransfer(this.wallet(), action, amountInput, target)
      if ('error' in result) throw new Error(result.error)
      return result.draft
    }

    const amount = parseDemoAmount(amountInput)
    if (amount === null) {
      throw new Error('Enter a positive amount with up to four decimal places.')
    }
    if (action !== 'topUp' && amount > this.wallet().balance) {
      throw new Error('The amount exceeds your available balance.')
    }
    if (action === 'topUp' || action === 'withdraw') {
      return { action, amount, target: session.account.mobile }
    }
    if (action !== 'send' || !recipient) throw new Error('Choose a Demo Wallet transfer or cash operation.')
    if (recipient.idType === 'MSISDN' && recipient.provider === session.account.payerDfspId &&
        recipient.identifier === session.account.mobile) {
      throw new Error('Choose a recipient other than your own wallet.')
    }

    const lookup = await demoWalletApi.lookup(session, recipient, amount)
    if (!lookup.transferId || !lookup.to) throw new Error('Demo Wallet did not return a recipient and transfer reference.')
    const quote = await demoWalletApi.quote(session, lookup.transferId, amount)
    if (quote.transferId !== lookup.transferId || quote.currentState !== 'WAITING_FOR_QUOTE_ACCEPTANCE') {
      throw new Error('Mojaloop did not return a quote ready for confirmation.')
    }
    const debit = apiAmount(quote.amount)
    if (debit <= 0 || debit > this.wallet().balance) throw new Error('The quoted debit is outside your available balance.')

    const to = lookup.to
    const displayName = to.displayName || to.name || [to.firstName, to.lastName].filter(Boolean).join(' ')
    const quotedReceive = quote.quoteResponse?.body?.payeeReceiveAmount
    return {
      action,
      amount: debit,
      target: displayName ? displayName + ' · ' + recipient.identifier : recipient.identifier,
      provider: to.fspId || to.partyIdInfo?.fspId || recipient.provider,
      transferId: lookup.transferId,
      receiveAmount: quotedReceive && { amount: apiAmount(quotedReceive.amount), currency: quotedReceive.currency },
    }
  }

  async post(draft: WalletDraft): Promise<PaymentReceipt> {
    const session = this.session()
    if (!session) {
      const result = postTransfer(this.wallet(), draft)
      if ('error' in result) throw new Error(result.error)
      this.state.set(result.wallet)
      return result.transaction
    }

    const { action, transferId } = draft
    const receipt: PaymentReceipt = {
      id: transferId ?? 'cash-' + Date.now(),
      reference: transferId ?? null,
      transferId,
      name: draft.target,
      category: action === 'topUp' ? 'Deposit' : actions[action].category,
      amount: draft.amount * (action === 'topUp' ? 1 : -1),
      date: Date.now(),
      icon: actions[action].icon,
      currency: session.currency,
    }

    if (action === 'send' && transferId) {
      const response = await demoWalletApi.confirm(session, transferId).catch(() => null)
      if (response?.transferId === transferId) {
        if (response.currentState === 'COMPLETED') return { ...receipt, status: 'Completed' }
        if (response.currentState === 'ABORTED') return { ...receipt, status: 'Failed' }
      }
      const checked = await this.checkStatus(receipt)
      if (checked.status === 'Pending') this.pending.update(pending => [...pending, checked])
      return checked
    }

    if (action !== 'topUp' && action !== 'withdraw') throw new Error('This operation requires a Demo Wallet quote.')
    try {
      const posting = await demoWalletApi.cash(session, action, draft.amount)
      const reference = posting.transactionId
      if (reference == null) throw new Error('Missing posting reference.')
      const amount = Math.abs(apiAmount(posting.amount)) * (action === 'topUp' ? 1 : -1)
      this.state.update(wallet => ({ ...wallet, balance: apiAmount(posting.balanceAfter) }))
      return { ...receipt, id: String(reference), reference: String(reference), status: 'Completed', amount }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The API did not confirm the posting.'
      if (error instanceof DemoWalletApiError && [400, 401, 403, 404, 422].includes(error.status)) {
        return { ...receipt, status: 'Failed', detail: message }
      }
      return {
        ...receipt,
        status: 'Pending',
        detail: message + ' Check your balance and history before making another cash operation.',
      }
    }
  }

  async checkStatus(receipt: PaymentReceipt): Promise<PaymentReceipt> {
    if (!receipt.transferId) return receipt
    const result = await demoWalletApi.status(receipt.transferId).catch(() => null)
    const status = result?.status === 'SUCCESS' && result.postingSuccess ? 'Completed' :
      result?.status === 'FAILED' ? 'Failed' : 'Pending'
    if (status !== 'Pending') this.pending.update(pending => pending.filter(item => item.transferId !== receipt.transferId))
    return {
      ...receipt,
      status,
      detail: status === 'Pending' ? 'Demo Wallet has yet to confirm this transfer. Check its status before sending again.' : undefined,
    }
  }

  toggleCardFreeze(): boolean {
    const frozen = !this.wallet().frozen
    this.state.update(wallet => ({ ...wallet, frozen }))
    return frozen
  }
}
