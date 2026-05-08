import { useChatStore } from '../stores/chatStore'

export default function PermissionDialog() {
  const permissionRequests = useChatStore((s) => s.permissionRequests)
  const removePermissionRequest = useChatStore((s) => s.removePermissionRequest)

  if (permissionRequests.length === 0) return null

  const req = permissionRequests[0]

  const handleOption = async (optionId: string) => {
    try {
      await (window as any).acpApi.respondPermission(req.id, optionId)
      removePermissionRequest(req.id)
    } catch (e) {
      console.error('respondPermission error:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Permission Required</h3>
        <p className="text-sm text-gray-600 mb-3">
          {req.toolCall.title || 'A tool is requesting permission'}
        </p>
        {req.toolCall.rawInput && (
          <pre className="bg-gray-800 text-gray-100 rounded p-3 text-xs overflow-x-auto mb-4 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {JSON.stringify(req.toolCall.rawInput, null, 2)}
          </pre>
        )}
        <div className="flex flex-wrap gap-2">
          {req.options.map((opt) => {
            const isAllow = opt.kind === 'allow' || opt.name.toLowerCase().includes('allow')
            const isDeny = opt.kind === 'deny' || opt.name.toLowerCase().includes('deny')
            let btnClass = 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            if (isAllow) btnClass = 'bg-green-600 text-white hover:bg-green-700'
            if (isDeny) btnClass = 'bg-red-600 text-white hover:bg-red-700'
            return (
              <button
                key={opt.optionId}
                onClick={() => handleOption(opt.optionId)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${btnClass}`}
              >
                {opt.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
