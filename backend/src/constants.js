export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', blurb: 'Warm-up · LeetCode Easy · phone screen' },
  { id: 'medium', label: 'Medium', blurb: 'Core interview patterns · LeetCode Medium' },
  { id: 'hard', label: 'Hard', blurb: 'Onsite level · LeetCode Hard · Codeforces Div2 D/E' },
  { id: 'very_hard', label: 'Very Hard', blurb: 'Competitive · Codeforces Div1 · Code Jam finals' },
];
export const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id);
export const difficultyLabel = (id) => DIFFICULTIES.find((d) => d.id === id)?.label || id;

export const QUESTION_TYPES = ['coding', 'mcq'];

// `coding: true` languages can be used for coding problems; the others are MCQ-only subjects.
export const LANGUAGES = [
  { id: 'python', label: 'Python 3', monaco: 'python', coding: true },
  { id: 'cpp', label: 'C++ 17', monaco: 'cpp', coding: true },
  { id: 'java', label: 'Java', monaco: 'java', coding: true },
  { id: 'javascript', label: 'JavaScript (Node.js)', monaco: 'javascript', coding: true },
  { id: 'typescript', label: 'TypeScript', monaco: 'typescript', coding: true },
  { id: 'c', label: 'C', monaco: 'c', coding: true },
  { id: 'go', label: 'Go', monaco: 'go', coding: true },
  { id: 'rust', label: 'Rust', monaco: 'rust', coding: true },
  { id: 'csharp', label: 'C#', monaco: 'csharp', coding: true },
  { id: 'kotlin', label: 'Kotlin', monaco: 'kotlin', coding: true },
  { id: 'php', label: 'PHP', monaco: 'php', coding: true },
  { id: 'ruby', label: 'Ruby', monaco: 'ruby', coding: true },
  { id: 'swift', label: 'Swift', monaco: 'swift', coding: true },
  { id: 'sql', label: 'SQL', monaco: 'sql', coding: false },
  { id: 'general', label: 'Language-agnostic (DSA / CS)', monaco: 'plaintext', coding: false },
];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);
export const CODING_LANGUAGE_IDS = LANGUAGES.filter((l) => l.coding).map((l) => l.id);
export const languageLabel = (id) => LANGUAGES.find((l) => l.id === id)?.label || id;

export const CODING_TOPICS = [
  'Arrays',
  'Strings',
  'Hashing',
  'Two Pointers',
  'Sliding Window',
  'Prefix Sums',
  'Binary Search',
  'Sorting',
  'Stack',
  'Monotonic Stack',
  'Queue & Deque',
  'Linked List',
  'Trees',
  'Binary Search Tree',
  'Heap / Priority Queue',
  'Graphs',
  'BFS / DFS',
  'Shortest Paths',
  'Union-Find',
  'Topological Sort',
  'Minimum Spanning Tree',
  'Dynamic Programming',
  'Greedy',
  'Backtracking',
  'Bit Manipulation',
  'Math & Number Theory',
  'Combinatorics',
  'Trie',
  'Segment Tree / Fenwick Tree',
  'Intervals',
  'Matrix / Grid',
  'String Algorithms',
  'Game Theory',
  'Divide & Conquer',
  'Simulation',
];

export const MCQ_TOPICS = [
  'Language Fundamentals',
  'Output Prediction',
  'Data Types & Operators',
  'Functions & Scope',
  'Closures',
  'OOP & Classes',
  'Memory & References',
  'Collections / STL',
  'Strings',
  'Exceptions & Errors',
  'Concurrency & Async',
  'Generics / Templates',
  'Standard Library',
  'Time & Space Complexity',
  'Data Structures',
  'Algorithms',
  'Recursion',
  'Dynamic Programming',
  'Graph Theory',
  'Bug Spotting',
  'Design Patterns',
  'Operating Systems',
  'Databases & SQL',
  'Computer Networks',
  'System Design Basics',
];

/** Minimal stdin/stdout templates, used when a problem has no starter code for a language. */
export const BOILERPLATES = {
  python: `import sys


def main():
    data = sys.stdin.read().split()
    # TODO: parse the input and print the answer


if __name__ == "__main__":
    main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // TODO: read the input and print the answer

    return 0;
}
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // TODO: read the input and print the answer
    }
}
`,
  javascript: `const input = require('fs').readFileSync(0, 'utf8').trim().split('\\n');

// TODO: parse the input and print the answer
`,
  typescript: `declare const require: any;
const input: string[] = require('fs').readFileSync(0, 'utf8').trim().split('\\n');

// TODO: parse the input and print the answer
`,
  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    // TODO: read the input and print the answer
    return 0;
}
`,
  go: `package main

import (
\t"bufio"
\t"fmt"
\t"os"
)

func main() {
\treader := bufio.NewReader(os.Stdin)
\twriter := bufio.NewWriter(os.Stdout)
\tdefer writer.Flush()

\tvar n int
\tfmt.Fscan(reader, &n)
\t// TODO: read the rest of the input and print the answer with fmt.Fprintln(writer, ...)
\t_ = n
}
`,
  rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut it = input.split_ascii_whitespace();
    // TODO: parse values with it.next().unwrap().parse::<i64>().unwrap() and print the answer
    let _ = it.next();
}
`,
  csharp: `using System;
using System.Collections.Generic;
using System.Linq;

class Program {
    static void Main() {
        var tokens = Console.In.ReadToEnd().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
        // TODO: parse the input and print the answer
    }
}
`,
  kotlin: `import java.io.*

fun main() {
    val br = BufferedReader(InputStreamReader(System.\`in\`))
    // TODO: read the input and print the answer
}
`,
  php: `<?php
$input = trim(stream_get_contents(STDIN));
$lines = explode("\\n", $input);
// TODO: parse the input and print the answer
`,
  ruby: `input = STDIN.read.split
# TODO: parse the input and print the answer
`,
  swift: `import Foundation

var lines: [String] = []
while let line = readLine() { lines.append(line) }
// TODO: parse the input and print the answer
`,
};

/** Extra rules appended to generation prompts so reference code runs on our judges. */
export const LANGUAGE_RULES = {
  python: 'Python 3 only. Read with sys.stdin. Avoid deep recursion (prefer iterative code or set sys.setrecursionlimit).',
  cpp: 'C++17. #include <bits/stdc++.h> is allowed. Use fast I/O and long long where overflow is possible.',
  java: 'Java 17. The class containing main MUST be `public class Main`. Use BufferedReader/StringTokenizer for fast input.',
  javascript: "Node.js (CommonJS). Read the whole input with require('fs').readFileSync(0, 'utf8'). Use BigInt when values can exceed 2^53.",
  typescript:
    "TypeScript for Node.js with no external packages. Start the file with `declare const require: any;` and read input via require('fs').readFileSync(0, 'utf8'). Do not use enums or namespaces.",
  c: 'C11. Use scanf/printf. Use long long where overflow is possible.',
  go: 'Go 1.22. package main, use bufio.Reader/Writer for fast I/O. No unused imports or variables.',
  rust: 'Rust 2021, std only (no external crates). Read all of stdin into a String and parse tokens.',
  csharp: 'C# 10 with `class Program` and `static void Main()`. Read input via Console.In.',
  kotlin: 'Kotlin/JVM with `fun main()`. Read input via System.`in`.bufferedReader().',
  php: 'PHP 8. Read input via stream_get_contents(STDIN) or fgets(STDIN).',
  ruby: 'Ruby 3. Read input via STDIN.read.',
  swift: 'Swift 5. Read input line by line via readLine().',
};
