#!/usr/bin/env node
// Basic Node.js demo: greeting, add numbers, show time, and exit.
// Save as FI8U6.JS and run with `node FI8U6.JS`.

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function ask(question) {
	return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
	console.log('Hello! This is a basic JavaScript (Node.js) demo.');

	const name = await ask('What is your name? ');
	console.log(`Nice to meet you, ${name || 'friend'}!`);

	const aRaw = await ask('Enter first number (or leave blank to skip addition): ');
	const bRaw = await ask('Enter second number: ');

	const a = parseFloat(aRaw);
	const b = parseFloat(bRaw);

	if (!Number.isNaN(a) && !Number.isNaN(b)) {
		console.log(`${a} + ${b} = ${a + b}`);
	} else if (!aRaw && !bRaw) {
		console.log('No numbers provided, skipping addition.');
	} else {
		console.log('One or both inputs were not valid numbers.');
	}

	console.log('Current time:', new Date().toLocaleString());

	rl.close();
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	rl.close();
});

