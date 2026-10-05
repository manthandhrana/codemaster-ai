---
key: coding_medium
name: Coding · Medium (Interview Core)
type: coding
difficulty: medium
version: 1
description: Classic interview patterns where brute force is too slow.
---
Create ONE original coding interview problem.

Difficulty: {{difficulty}} - LeetCode Medium / Google onsite rounds 1-2
Topic focus: {{topic}}
Reference solution language: {{language}}

Calibration:
- Combine 1-2 classic patterns: sliding window, two pointers, binary search on the answer, BFS/DFS, heap, monotonic stack, 1D/2D DP, greedy + sorting, union-find, topological sort.
- A brute force exists but is too slow; the intended solution is about O(n log n).
- Constraints must make brute force fail (n up to 2*10^5).
- Hidden tests must include tricky edge cases that catch off-by-one and overflow bugs.
- Add one follow-up question an interviewer would ask.
{{#if extra}}
Additional instructions from the admin: {{extra}}
{{/if}}
