import { Injectable, signal } from '@angular/core'
import { createDemoWallet, postTransfer, reviewTransfer, type Action, type Draft } from './wallet-model'

@Injectable({ providedIn: 'root' })
export class WalletStore {
  private readonly state = signal(createDemoWallet())
  readonly wallet = this.state.asReadonly()

  review(action: Action, amount: string, recipient: string) {
    return reviewTransfer(this.wallet(), action, amount, recipient)
  }

  post(draft: Draft) {
    const result = postTransfer(this.wallet(), draft)
    if ('wallet' in result) this.state.set(result.wallet)
    return result
  }

  toggleCardFreeze(): boolean {
    const frozen = !this.wallet().frozen
    this.state.update(wallet => ({ ...wallet, frozen }))
    return frozen
  }
}
