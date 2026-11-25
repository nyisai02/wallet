import type { ApplicationConfig } from '@angular/core'
import { provideLucideIcons } from '@lucide/angular'
import { walletIcons } from './shared/icons'

export const appConfig: ApplicationConfig = {
  providers: [provideLucideIcons(...walletIcons)],
}
