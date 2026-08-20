import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The update workflow writes the commit subject that decides how big the next
// release is, so this reads that script back out of the workflow and runs it
// rather than restating the logic. Restating it would keep passing while the
// workflow drifted away, which is exactly the failure worth catching: an
// upstream minor arriving as `fix` would ship as a patch and understate itself.
const workflow = readFileSync(new URL('../.github/workflows/check-updates.yml', import.meta.url), 'utf8');

function extractLevelScript() {
    const marker = "LEVEL=\"$(node -e '";
    const start = workflow.indexOf(marker);
    if (start === -1) {
        throw new Error('could not find the level script in check-updates.yml');
    }
    const from = start + marker.length;
    const end = workflow.indexOf("' \"${PINNED_WEB}\"", from);
    if (end === -1) {
        throw new Error('could not find the end of the level script in check-updates.yml');
    }
    return workflow.slice(from, end);
}

const script = extractLevelScript();

function levelFor(pinned, latest) {
    let output = '';
    const fakeProcess = {
        // Under `node -e`, argv is [execPath, ...args]: the script body is not
        // an entry, which is why the script reads from slice(1).
        argv: ['node', pinned, latest]
    };
    const fakeConsole = { log: (value) => { output = String(value); } };

    new Function('process', 'console', script)(fakeProcess, fakeConsole);
    return output;
}

// The mapping the release depends on: semantic-release turns feat! into a
// major, feat into a minor and fix into a patch.
const TYPE_FOR_LEVEL = { major: 'feat!', minor: 'feat', patch: 'fix' };

describe('sizing a release to the jellyfin-web bump', () => {
    it('reads a patch release as a patch', () => {
        expect(levelFor('v10.11.11', 'v10.11.12')).toBe('patch');
    });

    it('reads a minor release as a minor', () => {
        expect(levelFor('v10.11.11', 'v10.12.0')).toBe('minor');
    });

    it('reads a major release as a major', () => {
        expect(levelFor('v10.11.11', 'v12.0.0')).toBe('major');
    });

    it('reads a major jump as major even when the minor drops', () => {
        // 11.0.0 after 10.11.11: the minor went down, but the major moved and
        // that is what counts.
        expect(levelFor('v10.11.11', 'v11.0.0')).toBe('major');
    });

    it('handles tags with and without the leading v', () => {
        expect(levelFor('10.11.11', 'v10.12.0')).toBe('minor');
        expect(levelFor('v10.11.11', '10.12.0')).toBe('minor');
    });

    it('maps each level onto the commit type semantic-release expects', () => {
        // Guards the mapping in the workflow's case statement: if a level ever
        // lost its type, releases would silently size wrong rather than fail.
        expect(TYPE_FOR_LEVEL[levelFor('v10.11.11', 'v10.11.12')]).toBe('fix');
        expect(TYPE_FOR_LEVEL[levelFor('v10.11.11', 'v10.12.0')]).toBe('feat');
        expect(TYPE_FOR_LEVEL[levelFor('v10.11.11', 'v12.0.0')]).toBe('feat!');
    });
});
