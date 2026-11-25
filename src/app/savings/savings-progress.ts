import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { money, savingsName, savingsTarget } from '../wallet/wallet-model'

@Component({
  selector: 'wallet-savings-progress',
  imports: [LucideDynamicIcon],
  templateUrl: './savings-progress.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SavingsProgress {
  readonly saved = input.required<number>()

  protected readonly money = money
  protected readonly savingsName = savingsName
  protected readonly savingsTarget = savingsTarget
  protected readonly goalProgress = computed(() => Math.min(100, Math.round(this.saved() / savingsTarget * 100)))
}
