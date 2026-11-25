import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { account } from './wallet-model'

@Component({
  selector: 'wallet-card',
  imports: [LucideDynamicIcon],
  templateUrl: './wallet-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class WalletCard {
  readonly frozen = input.required<boolean>()

  protected readonly account = account
}
