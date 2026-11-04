Add-Type -AssemblyName System.Speech

$dataDir = "$PSScriptRoot\..\data\stt_eval_answers"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

$answers = @(
    # --- Legacy 10 Answers for T1/T2 backwards compatibility ---
    @{ id = "ans_01"; text = "To guarantee distributed idempotency across payment services we persist unique request tokens and apply transactional outbox patterns" },
    @{ id = "ans_02"; text = "In React reconciliation compares virtual DOM trees using unique keys to minimize real DOM mutations and layout reflows" },
    @{ id = "ans_03"; text = "Circuit breakers prevent cascading failures in microservices by intercepting failing endpoints and falling back gracefully" },
    @{ id = "ans_04"; text = "The CAP theorem forces distributed databases to choose between strong consistency and high availability during network partitions" },
    @{ id = "ans_05"; text = "B-trees excel at range queries and sequential disk scans whereas hash indexes provide constant time single key lookups" },
    @{ id = "ans_06"; text = "We protect public REST endpoints by validating JWT tokens on incoming requests and throttling traffic via Redis token buckets" },
    @{ id = "ans_07"; text = "Python uses a global interpreter lock to ensure thread safety preventing multiple native threads from executing bytecode in parallel" },
    @{ id = "ans_08"; text = "Kafka achieves high throughput through sequential disk append logs partition parallelism and zero copy kernel page caching" },
    @{ id = "ans_09"; text = "Continuous integration pipelines validate pull requests by executing unit tests and code linters before building container images" },
    @{ id = "ans_10"; text = "To prevent SQL injection attacks developers must always use parameterized queries instead of string concatenation" },

    # --- 10 Short Curated Answers (<= 15s) (§T3) ---
    @{ id = "ans_short_01"; text = "ACID guarantees that database transactions are atomic consistent isolated and durable ensuring data integrity even during system crashes in PostgreSQL" },
    @{ id = "ans_short_02"; text = "An idempotent HTTP method like PUT or DELETE produces identical server state regardless of how many times the request is retried" },
    @{ id = "ans_short_03"; text = "Goroutines in Go utilize cooperative M to N scheduling with dynamic two kilobyte stacks rather than fixed megabyte operating system threads" },
    @{ id = "ans_short_04"; text = "OAuth2 with PKCE protects single page applications by verifying code challenge hashes preventing authorization code interception without a client secret" },
    @{ id = "ans_short_05"; text = "Optimistic locking verifies entity version timestamps before committing updates while pessimistic locking holds exclusive database row locks to block concurrent writes" },
    @{ id = "ans_short_06"; text = "GraphQL resolves REST overfetching by allowing clients to request precise fields in a single query though it adds backend query parsing overhead" },
    @{ id = "ans_short_07"; text = "When consumer group members change in Kafka partition rebalancing temporarily pauses consumption while topics are reassigned among active workers" },
    @{ id = "ans_short_08"; text = "Kubernetes liveness probes restart failing container pods while readiness probes stop routing network traffic until the application finishes warm up" },
    @{ id = "ans_short_09"; text = "Circuit breakers trip open when downstream microservice error rates exceed thresholds returning fast fallback responses to prevent cascading thread starvation" },
    @{ id = "ans_short_10"; text = "B-tree indexes optimize ranged queries and sorted scans in relational databases whereas hash indexes only accelerate exact key equality matches" },

    # --- 10 Long Curated Answers (45–90s) (§T3) ---
    @{ id = "ans_long_01"; text = "In our distributed architecture we ingest millions of telemetry events per second using Apache Kafka partitions and Spring Boot microservices. Each microservice consumer group processes incoming events asynchronously with committed consumer offsets. To handle traffic spikes without data loss we configure backpressure using reactive streams and buffer uncommitted events on local NVMe storage. We implement dead letter queues to isolate corrupted payloads while schema registries enforce strict Avro contracts to prevent serialization mismatches across downstream analytics pipelines." },
    @{ id = "ans_long_02"; text = "To build a resilient payment processing gateway we apply the transactional outbox pattern alongside distributed Redis locks with redlock algorithm guarantees. When a payment request arrives we store an idempotent idempotency key in PostgreSQL within an ACID transaction before contacting Stripe or PayPal. A background worker periodically flushes the outbox table to emit Kafka events to the settlement service. If a network timeout occurs during provider communication our exponential backoff retry loop queries the payment status instead of double charging the customer card." },
    @{ id = "ans_long_03"; text = "During our monolithic decomposition we migrated twenty core business modules into containerized microservices deployed on Kubernetes clusters managed by ArgoCD. We implemented an Istio service mesh to enforce mutual TLS encryption and fine-grained traffic routing between pods. Using canary deployment strategies we routed five percent of production user traffic to new container versions while monitoring Prometheus error metrics. This allowed us to roll back regressions automatically within sixty seconds without affecting user active checkout sessions." },
    @{ id = "ans_long_04"; text = "When designing storage for high-frequency IoT telemetry we evaluated PostgreSQL partitioned tables against MongoDB replica sets. While PostgreSQL excels at complex relational joins and financial consistency write throughput degraded under continuous unindexed JSON inserts. We chose MongoDB with time series collections and shard keys distributed across primary nodes. We kept PostgreSQL for user authentication and billing records while streaming sensor metrics directly into MongoDB through a Kafka sink connector achieving ninety thousand writes per second." },
    @{ id = "ans_long_05"; text = "In a previous role our primary Java microservice experienced intermittent out of memory heap crashes during peak black Friday traffic. As the lead backend engineer I captured heap dumps using async profiler and analyzed object retention graphs in Eclipse Memory Analyzer. I discovered that a third-party caching library was holding strong references to unclosed HTTP response streams preventing garbage collection from reclaiming heap space. I replaced the cache with Guava weak references and configured proactive JVM heap alerts in Datadog completely stabilizing service uptime." },
    @{ id = "ans_long_06"; text = "Our company needed to migrate customer workloads from a single European datacenter to multi-region AWS infrastructure to satisfy global latency SLAs. I led a team of six engineers to define Terraform infrastructure as code templates and established active-active database replication using Amazon Aurora Global Database. We coordinated DNS failover through Route 53 with health check policies. We executed the transition over a scheduled weekend maintenance window with zero downtime and reduced transatlantic API response latency by sixty percent." },
    @{ id = "ans_long_07"; text = "In distributed financial systems traditional two-phase commit protocols introduce prohibitive latency and single points of failure because database coordinators lock resources across network boundaries. Instead we implement the Saga orchestration pattern with Temporal workflows. Each microservice executes a local ACID transaction and publishes status events to Kafka. If an order inventory reservation succeeds but the customer payment fails the workflow orchestrator triggers compensating transactions in reverse order releasing reserved stock and issuing refund notifications cleanly without distributed deadlocks." },
    @{ id = "ans_long_08"; text = "When investigating API latency spikes exceeding three seconds we discovered PostgreSQL connection pool exhaustion in HikariCP caused by slow table scans. Using pg stat statements and EXPLAIN ANALYZE I identified a missing composite index on user tenant ID and timestamp columns that forced sequential scans across ten million rows. After applying concurrent B-tree indexes and tuning the work mem buffer allocation query execution time dropped from two point eight seconds to four milliseconds reducing database CPU utilization from eighty-five percent to under twenty percent." },
    @{ id = "ans_long_09"; text = "To establish a zero-trust network architecture across our cloud environments we removed perimeter-based firewall assumptions and instituted defense-in-depth principles. Every microservice communication is encrypted with mutual TLS using ephemeral SPIFFE certificates rotated hourly. Inbound requests at the Envoy API gateway undergo JWT signature verification and rate limiting based on client IP addresses. Additionally service accounts utilize least-privilege IAM roles with HashiCorp Vault secrets injected dynamically into container environment variables rather than hardcoded configuration files." },
    @{ id = "ans_long_10"; text = "For our real-time collaborative whiteboarding platform we designed a bi-directional WebSocket architecture backed by Redis pub sub clusters. As users draw shapes or edit markdown notes client events are dispatched with monotonic sequence numbers. We utilize Conflict-free Replicated Data Types or CRDTs to resolve concurrent merge conflicts optimistically on the client before syncing with the backend server. To minimize WebSocket thread consumption on Node.js we employ socket clustering with sticky session load balancing managed by Nginx." }
)

$meta = @()

foreach ($item in $answers) {
    $wavPath = "$dataDir\$($item.id).wav"
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = 0
    $synth.SetOutputToWaveFile($wavPath)
    $synth.Speak($item.text)
    $synth.Dispose()

    $meta += [PSCustomObject]@{
        id = $item.id
        wav_file = "$($item.id).wav"
        reference_text = $item.text
        size_bytes = (Get-Item $wavPath).Length
    }
    Write-Host "Synthesized $($item.id).wav ($((Get-Item $wavPath).Length) bytes)"
}

$meta | ConvertTo-Json -Depth 4 | Set-Content "$dataDir\manifest.json" -Encoding utf8
Write-Host "Manifest written to $dataDir\manifest.json ($($meta.Count) items)"
