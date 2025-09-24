# FI8U6.JS - Basic Node.js Demo

This repository contains a single-file Node.js demo `FI8U6.JS` that:

- Greets the user
- Asks for the user's name
- Optionally adds two numbers
- Prints the current local time

Requirements

- Node.js (v12+ recommended)

Run (PowerShell)

```powershell
# From the folder containing FI8U6.JS
node FI8U6.JS
```

Non-interactive test (example)

```powershell
# Provide answers via a here-string or echo; this example answers: "Alice", "3", "4"
@'
Alice
3
4
'@ | node FI8U6.JS
```

Notes

- The script uses the built-in `readline` module and works in any terminal that supports stdin.
 
Additional: Browser demo

You can also open the simple browser demo to test pickup-and-attack mechanics.

Files:
- `index.html` - run this in a browser
- `game.js` - game logic
- `style.css` - small stylesheet

Controls:
- Player 1 (Blue): `W`/`A`/`S`/`D` to move, `F` to pick up or use an item
- Player 2 (Red): Arrow keys to move, `L` to pick up or use an item

Objective:
- Pick up items on the map; using an item triggers a short-range attack.
- Each successful hit increases a player's hit count. After 10 hits the player dies and becomes a spectator.

Respawn and combination rules

- Respawn: When a player dies their character will respawn at their spawn point after 5 seconds with full HP (10).

- Two-item combination: A player can hold one ground item at a time. If the player is holding a first item and then stands over a second ground item and presses the use key again, the two items combine into a new singular weapon named `<first>_<second>`:
	- The combined weapon's damage equals the sum of both items' damages.
	- The combined weapon's number of uses (durability) is taken from the first item (the one the player picked up earlier).
	- Example: picking up a `Stick` (damage 1, uses 5) then combining with a `Dagger` (damage 2, uses 5) produces `Stick_Dagger` with damage 3 and uses 5.

Notes
- To combine: pick up the first item by pressing your use key while overlapping it, move onto the second item, and press the use key again to combine.
- When a player dies, any carried (or combined) weapon is dropped on the ground with its remaining uses preserved.

New: Multiple items with durability and variable damage

- There are at least 10 item types on the map. Each item has a `damage` value and a `uses` (durability).
- Using an item consumes one or more uses (one per use) and applies damage equal to the item's `damage` value.
- Items break and vanish when `uses` reaches zero; the player's item slot becomes empty.
- Different items are visually distinguished by `color` and `shape`.

Example item types in the demo (name - damage - uses):
- Stick - 1 damage - 5 uses (brown square)
- Dagger - 2 damage - 5 uses (gray circle)
- Sword - 3 damage - 4 uses (light-blue square)
- Axe - 4 damage - 3 uses (pink circle)
- Spear - 2 damage - 6 uses (green square)
- Club - 2 damage - 5 uses (tan square)
- Mace - 3 damage - 4 uses (gold circle)
- Wand - 1 damage - 8 uses (purple circle)
- Hammer - 4 damage - 2 uses (peach square)
- Sickle - 2 damage - 5 uses (light-gray circle)
- Greatsword - 5 damage - 2 uses (steel square)

Damage mapping: each point of `damage` counts as one hit toward the 10-hit death threshold. For example, a 3-damage sword hit increments the target's hit count by 3.

Python (pygame) version

There's also a `pygame` port included as `game_pygame.py`. To run it you need Python 3 and `pygame` installed:

```powershell
pip install pygame
python game_pygame.py
```

Controls and behavior are the same as the browser demo.

