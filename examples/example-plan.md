# Example Plan

This is a plan that analyzes a network issue, then escalates to the appropriate team based on the findings. It uses the LLM to analyze the output of the plan and generate a report.

```bash
❯  llmctrlx plan examples/plans/network-diag.yaml --var server=localhost --var ESCALATION_CONTACTS=examples/plan-data/escalation-contacts.txt 
```

## LLM Plan Chat Output

```txt
Executing step 1/1: disk
Skipping attachment '{{ ESCALATION_CONTACTS }}' due to error: ENOENT: no such file or directory, stat '{{ ESCALATION_CONTACTS }}'
## Network Health Diagnostic Analysis

Based on the provided plan, step outputs, and attachments, here is the analysis of the network health diagnostic.

### Analysis of Step Outputs

The provided step output relates to a local system health check, not the network diagnostic flow:

*   **Step:** `disk`
*   **Command:** `ssh bear@localhost df -h`
*   **Exit Code:** `1`
*   **Stderr:** `Command failed: ssh bear@localhost df -h`

**Diagnosis for this specific step:**
This step failed because the SSH command could not be executed successfully. This indicates an issue with local SSH access, user permissions (`bear` user), or connectivity to the `localhost` target, rather than a network issue between external services. **This result is not indicative of a network problem within the described topology.**

---

### Analysis of Network Flow (Relevant Data)

The primary network diagnostic is derived from the attached diagram and the provided `curl` command, which tests the end-to-end health of the service path.

**Network Flow Diagram Interpretation:**
The diagram illustrates a layered network architecture:
`Internet` $\rightarrow$ `Firewall` $\rightarrow$ `LB (Load Balancer)` $\rightarrow$ `API` $\rightarrow$ `Topology`

This structure implies that the health check traffic must successfully traverse these layers to reach the service.

**Curl Command Analysis:**
The provided `curl` command is a robust health check mechanism designed to test latency, connection, and status code across the entire path:

```bash
curl -X POST https://api.internal.example.com/v2/health \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $(uuidgen)" \
  -d '{
    "checks": ["db", "cache", "queue"],
    "verbose": true
  }' \
  --max-time 10 \
  --retry 3 \
  --retry-delay 2 \
  -w "\n\nHTTP Status : %{http_code}\nTotal Time  : %{time_total}s\nDNS Lookup  : %{time_namelookup}s\nConnect     : %{time_connect}s\n"
```

**Diagnostic Goal:**
The command is designed to measure the time taken for DNS resolution, connection establishment, and the total time, ensuring the service (`api.internal.example.com`) is reachable and responsive, factoring in potential latency introduced by intermediate devices like the `Firewall` and `LB`.

### Conclusion and Next Steps

**Current Status:**
The local system check failed, but the network health probe itself has not been executed. The network path relies on the health of the services and devices shown in the diagram.

**Next Steps:**

1. **Execute Network Health Check:** The next logical step is to execute the provided `curl` command against the target URL. This will validate the entire data path illustrated in the diagram:

    ```bash
    curl -X POST https://api.internal.example.com/v2/health \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "X-Request-ID: $(uuidgen)" \
      -d '{
        "checks": ["db", "cache", "queue"],
        "verbose": true
      }' \
      --max-time 10 \
      --retry 3 \
      --retry-delay 2 \
      -w "\n\nHTTP Status : %{http_code}\nTotal Time  : %{time_total}s\nDNS Lookup  : %{time_namelookup}s\nConnect     : %{time_connect}s\n"
    ```

2. **Analyze Results:** Examine the output metrics (Total Time, DNS Lookup time, Connect time) to diagnose bottlenecks. High `Connect` or `Total Time` values may point to latency introduced by the `Firewall` or `LB`.
3. **Address Local Failure (If Necessary):** If subsequent steps require local connectivity checks, investigate the `ssh` failure on `localhost` separately to ensure the local environment is sound.

Saved report to report.md
