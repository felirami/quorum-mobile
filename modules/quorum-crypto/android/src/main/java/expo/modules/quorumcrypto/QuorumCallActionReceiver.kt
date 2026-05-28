package expo.modules.quorumcrypto

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * BroadcastReceiver that handles Accept/Decline actions from the
 * incoming call notification. Bridges back to the Expo module which
 * emits JS events.
 */
class QuorumCallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra("callId") ?: return
        val module = QuorumCryptoModule.instance ?: return

        when (intent.action) {
            "com.quilibrium.quorum.ACCEPT_CALL" -> {
                module.handleCallAction("answer", callId)
            }
            "com.quilibrium.quorum.DECLINE_CALL" -> {
                module.handleCallAction("end", callId)
            }
        }
    }
}
