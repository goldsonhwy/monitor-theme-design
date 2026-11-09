/// <reference types="node" />
import assert from "node:assert/strict"
import { safeNodes, type Node } from "./api.ts"
import { latestCarrierPings, mergeCarrierPings, type PingHistoryLike } from "./pingMapping.ts"

const node = { id: 1, metrics: { uptime: 100, cpu: 1, load: [0.1, 0.2, 0.3],
  mem_total: 1024, mem_used: 512, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 1024,
  net_rx: 10, net_tx: 20, total_rx: 100, total_tx: 200, month_rx: 50, month_tx: 100,
  tcp: 3, udp: 4, procs: 20 } } as Node
assert.equal(safeNodes([node])[0], node)
for (const patch of [{ load: null }, { load: [1, "bad", 3] }, { cpu: "bad" }, { net_rx: Infinity }]) {
  const bad = { ...node, metrics: { ...node.metrics, ...patch } } as unknown as Node
  const result = safeNodes([bad, node])
  assert.equal(result[0].metrics, null)
  assert.equal(result[1], node)
}
console.log("invalid live reports are isolated")

const history: PingHistoryLike = {
  probes: { "11": "CTCC TCP", "12": "CMCC 移动", "13": "CUCC线路" },
  ping: [
    { task_id: 11, ts: 100, latency: 32, loss: 1 },
    { task_id: 11, ts: 200, latency: 28, loss: 2 },
    { task_id: 12, ts: 200, latency: 41, loss: 0 },
    { task_id: 13, ts: 200, latency: 55, loss: 3.2 },
  ],
  loss: { "11": 99, "12": 88, "13": 77 },
}
assert.deepEqual(latestCarrierPings(history), {
  telecom: { latency: 28, loss: 1.5 },
  mobile: { latency: 41, loss: 0 },
  unicom: { latency: 55, loss: 3.2 },
})
console.log("carrier ping mapping passed")

assert.deepEqual(mergeCarrierPings(
  { telecom: { latency: 28 }, unicom: { loss: 3.2 } },
  { telecom: { latency: 99, loss: 1 }, mobile: { latency: 41, loss: 0 }, unicom: { latency: 55 } },
), {
  telecom: { latency: 28, loss: 1 },
  mobile: { latency: 41, loss: 0 },
  unicom: { latency: 55, loss: 3.2 },
})
const timeoutHistory: PingHistoryLike = {
  probes: { "21": "电信" },
  ping: [{ task_id: 21, ts: 300, latency: null, loss: 12.5 }],
}
assert.deepEqual(latestCarrierPings(timeoutHistory), {
  telecom: { latency: undefined, loss: 12.5 },
})
console.log("carrier timeout loss is preserved")
