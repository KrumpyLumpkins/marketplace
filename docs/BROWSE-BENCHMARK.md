# Browse HTTP benchmark

The existing `scripts/bench/sdk-efficiency.mjs` script samples HTTP GET latency and response size. Despite its historical filename, it does not run browser JavaScript, count SDK requests or measure filter interaction/rendering latency. Use browser instrumentation for those measurements and the build plan for new backend/contract performance gates.

```sh
mkdir -p .context
node scripts/bench/sdk-efficiency.mjs \
  --samples 7 \
  --out .context/browse-http-report.json \
  --target home=http://localhost:3000/ \
  --target 'collection=http://localhost:3000/collections/<address>'
```

Replace `<address>` with a configured collection. Keep routes, sample counts and environment comparable between runs. The JSON records successful response latency/bytes and request/error counts; a successful HTML response does not prove marketplace data loaded. Scratch reports remain in ignored `.context/`.
