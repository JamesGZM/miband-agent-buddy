// Process-level integration fixture: inject only the isolated receiver port.
import {runBuddyCli} from '../../services/runtime/bin/buddy-cli.mjs';
import {submitActivity} from '../../services/runtime/src/adapters/activity-client.mjs';
const [port, ...args] = process.argv.slice(2);
// This fixture tests process isolation under the parallel suite; deadline coverage uses a separate stalled receiver.
const result = await runBuddyCli(args, {submit: value => submitActivity(value, {port: Number(port), timeoutMs: 5000})});
process.stdout.write(JSON.stringify(result.value) + '\n');
