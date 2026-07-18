## Unloaded Utils
## Made by Nytreon
**Unloaded Utils** Interacts with unloaded chunks using Bedrock engine primitives and abstracts them for the Minecraft Bedrock Script API (`@minecraft/server`). It bypasses engine limitations by allowing developers to get, set, fill, clone blocks, and spawn entities in unloaded chunks without throwing errors or breaking the game state.

Using a combination of tricks this utility makes the impossible possible in Bedrock scripting.

Unloaded Chunk Manipulation: Set, fill, and clone blocks in areas players haven't generated or loaded yet.

# Features
- Virtual Blocks (VBlocks): A custom reimplementation of Minecraft's native Block object that seamlessly handles asynchronous state updates for unloaded blocks.
- Global Entity Spawning: Force-spawn entities anywhere in the world instantly.
- Chunk State Detection: Read whether a chunk is currently Loaded, Unloaded, or Invalid. (as long as the world has a bedrock layer)
- Asynchronous Queueing: Automatically queues block modifications to prevent structures from overwriting each other during rapid execution.

# Prerequisites & Setup
"mystructure:UnloadedWriter" is an NBT-edited structure block structure required for the _createBlocks primitive pipeline just put the .mcstructure into your ./structures directory to get everything going!.

# Known bugs! 
- When queuing in invalid chunks the game's engine queues the structure ID not the structure content so if you write new blocks using the API it will write the new blocks instead when the area is rendered! (I have yet to come up with a good fix for this)
- when doing /reload stuff might break due to an optimization I made.... if you hate this fact just change just change line 231 to use a set value of 2 instead of the delay variable. I will be making it more robust later.

 ## API Reference

### Methods

| Method | Parameters | Return Type | Description |
| --- | --- | --- | --- |
| `setBlock()` | `pos`, `dimension`, `blockType` | `Promise<void>` | Sets a single block at the target location, even if unloaded. |
| `clone()` | `from`, `to`, `pos`, `dimension` | `Promise<void>` | Clones a volume of blocks to an unloaded target position. |
| `fillBlocks()` | `from`, `to`, `dimension`, `blockType` | `Promise<void>` | Fills a specified volume with a block type in unloaded chunks. |
| `getBlock()` | `pos`, `dimension` | `Promise<VBlock>` | Fetches a virtual block reference (`VBlock`) for an unloaded block. |
| `spawn()` | `pos`, `dimension`, `entityType`, `options` | `void` | Spawns an entity safely at any global coordinate. |
| `getChunkState()` | `dimension`, `pos` | `1 ⏐ 0 ⏐ -1` | Returns `1` (Loaded), `0` (Unloaded), or `-1` (Invalid). |
| `tickArea()` | `pos`, `ticks`, `dimension` | `Promise<void>` | Creates a temporary ticking area at a location for a set duration. |
| `setOffset()` | `offset` | `void` | Adjusts the safe coordinate offset zone (Default: `4000000`). |

---

## Usage Examples

### 1. Setting a Block in an Unloaded Chunk

```javascript
import { world } from "@minecraft/server";
import { UnloadedUtils } from "./UnloadedUtils.js";

const targetPos = { x: 50000, y: 64, z: 50000 };
const overworld = world.getDimension("overworld");

// Safely sets a diamond block out in the middle of nowhere
await UnloadedUtils.setBlock(targetPos, overworld, "minecraft:diamond_block");

```

### 2. Reading and Modifying a Virtual Block (VBlock)

```javascript
const blockPos = { x: 10000, y: 70, z: -10000 };
const vBlock = await UnloadedUtils.getBlock(blockPos, overworld);

console.log(`The block type is: ${vBlock.typeId}`);

if (vBlock.isAir) {
    await vBlock.setType("minecraft:gold_block");
}

```

### 3. Force Spawning an Entity Globally

```javascript
const farAwayPos = { x: -25000, y: 64, z: 80000 };

// Spawns near the player safely at the world height limit, then instantly teleports to the target
UnloadedUtils.spawn(farAwayPos, overworld, "minecraft:zombie", { nameTag: "The Wanderer" });

```

## How it all works!

As you may know, normally when interacting with unloaded chunks, script API will usually throw an [UnloadedChunksError](https://stirante.com/script/server/2.8.0/classes/UnloadedChunksError.html) which can severely limit what we can do. This API hopes to provide developers with the tools they need to interact with these forbidden chunks!
- **Setting**: Normally there is absolutely no way to be able to write to these chunks, however there is one thing that can write arbitrary data to these chunks, **Structure blocks**! By setting a ticking area 4 million blocks out and then NBT editing a structure block to be able to be pushed beyond the normal 99k bound I can have a write primative to these chunks!
- **Getting**: Luckily this time around the API does provide a roundabout way to access blocks in these chunks. The createFromWorld function does not throw errors in these chunks allowing me to grab a structure, put it 4 million blocks out and read the content! After that I wrap the data and a few custom callbacks for live data in a VBlock (Virtual Block) and return that to the end user allowing them to dynamically call the block as if it was a real one!
- **Spawning**: This one was by far the easiest! All it does is find a player, spawn an entity at y 320, and then teleport them to the target area. This works because ScriptAPI all fires in one subtick so functionally it was like the entity spawned there.
