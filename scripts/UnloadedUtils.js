import { system, world, BlockVolume } from "@minecraft/server"
const startUpTick = system.currentTick;
let hasReloaded = false;

//Unloaded Utils V1.0 by Nytreon

export const UnloadedUtils = {
    get tickManager() {
        return world.tickingAreaManager;
    },
    get structManager() {
        return world.structureManager;
    },
	safeOffset: 4000000,
	_queue: Promise.resolve(),

	//allow force setting blocks in unloaded chunks
	async setBlock(pos, dimension, blockType) {
		const job = async () => {
			const blockPos = this._toBlockPos(pos);
			const p = { ...blockPos, x: blockPos.x - this.safeOffset, };
			const b = { x: p.x + 1, y: p.y, z: p.z + 1 };
		
			//set block and add it to the writer
			const callBack = () => {
				dimension.setBlockType(b, blockType);
				this.structManager.createFromWorld("unloadedutils:blocktowrite", dimension, b, b, { includeEntities: false });
			};

			await this._createBlocks(dimension, p, b, callBack, p);

		};

		//queue to keep fc:blocktowrite from being overwritten
		const next = this._queue.then(job);
		this._queue = next.catch(() => {});
		return next;
	},

	//clone a given area into unloaded chunks
	async clone(from, to, pos, dimension,) {
		const job = async () => {
			const blockPos = this._toBlockPos(pos);

			const p = { ...blockPos, x: blockPos.x - this.safeOffset, };
			const b = { x: p.x + 1, y: p.y, z: p.z + 1 };

			//clone area to writer
			const callBack = () => {
				this.structManager.createFromWorld(
					"unloadedutils:blocktowrite",
					dimension,
					this._toBlockPos(from),
					this._toBlockPos(to),
					{ includeEntities: false }
				);
			};
			
			await this._createBlocks(dimension, p, b, callBack, p);

		};
		//queue to keep fc:blocktowrite from being overwritten
		const next = this._queue.then(job);
		this._queue = next.catch(() => {});
		return next;
	},

	//fill a given area even if the area is unloaded
	async fillBlocks(from, to, dimension, blockType) {
	    const job = async () => {
	        const start = this._toBlockPos(from);
			const end = this._toBlockPos(to);

			//(internal screaming)
	        const size = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
	        const tempFrom = { x: start.x - this.safeOffset, y: start.y, z: start.z };
			const tempTo = { x: tempFrom.x + size.x, y: tempFrom.y + size.y, z: tempFrom.z + size.z };
		
	        const structurePos = {
				x: to.x > from.x ? tempFrom.x : tempTo.x, 
				y: to.y > from.y ? tempFrom.y : tempTo.y, 
				z: to.z > from.z ? tempFrom.z : tempTo.z, 
			};

			//fill a volume and write it to the writer
			const callBack = () => {
	            dimension.fillBlocks(new BlockVolume(tempFrom, tempTo), blockType);
	            this.structManager.createFromWorld("unloadedutils:blocktowrite", dimension, tempFrom, tempTo, { includeEntities: false });
			}
			await this._createBlocks(dimension, tempFrom, tempTo, callBack, structurePos);
		};
		//queue to keep fc:blocktowrite from being overwritten
		const next = this._queue.then(job);
		this._queue = next.catch(() => {});
		return next;
	},

	//allows user to set the offset (default is 4000000)
	setOffset(offset) {
		this.safeOffset = offset;
	},

	//creates a read only unloaded chunk from an invalid chunk
	cacheChunk(pos, dimension) {
		const players = world.getPlayers();
		const target = players[0];
		const currentSpawn = target.getSpawnPoint();
		target.setSpawnPoint({dimension, ...pos})
		target.setSpawnPoint(currentSpawn)
	},

	//allow "force" spawning anywhere
	spawn(pos, dimension, entityType, entityOptions) {
		const players = world.getPlayers();
		const entity = dimension.spawnEntity(
			entityType, 
			{ ...players[0].location, y: 320}, 
			entityOptions
		);

		//spawn and the tp happen in the same tick (functionally like it was always there ✨)
		entity.teleport(pos, { dimension });
	},

	//return virtual block reimplimentation using my primitives
	async getBlock(pos, dimension) {
		const block = await this._getClonedReference(pos, dimension);
		const location = this._toBlockPos(pos);
		const VBlock = this._constructVBlock(block, dimension, location);

		return VBlock;
	},

	//shows if a given tile is loaded, unloaded, or invalid
	getChunkState(dimension, pos) {
		const p = this._toBlockPos(pos);

		if (dimension.isChunkLoaded({ ...p, y: -64}))
		    return 1;

		//getBlockFromRay doesn't error out like other things in unloaded chunks
		//NOTE: this does assume there is a bedrock floor in the world sadly :/
		const hits = dimension.getBlockFromRay({ ...p, y: -64}, {x: 0, y: -1, z: 0}, {
			maxDistance: 1,
			includeLiquidBlocks: true,
			includePassableBlocks: true
		});

		if (hits) {
			return 0;
		} else {
			return -1;
		}
	},
	
	//loads a given unloaded area for a set amount of ticks not much to see
	async tickArea(pos, ticks, dimension) {
		return new Promise(resolve => {
			const p = this._toBlockPos(pos);
			const id = `fc_temp_${system.currentTick}_${Math.floor(Math.random() * 1e6)}`;

			this.tickManager.createTickingArea(id, {
			    dimension,
			    from: p,
			    to: p
			});

			system.runTimeout(() => {
			    this.tickManager.removeTickingArea(id);
			    resolve();
			}, ticks);
		});
	},

	//returns short lived block reference 
	async _getClonedReference(pos, dimension) {
		return new Promise((resolve, reject) => {
			const id = `fc_temp_${system.currentTick}_${Math.floor(Math.random() * 1e6)}`;
			const structure = `fc:temp_${system.currentTick}_${Math.floor(Math.random() * 1e6)}`;
			const blockPos = this._toBlockPos(pos)
			const p = { x: this.safeOffset, y: 0, z: this.safeOffset };

			this.fastDeclareTickingArea(id, {
				dimension,
				from: p,
				to: p
			});

			try {
				//save structure works in unloaded chunks btw
				this.structManager.createFromWorld(
					structure,
					dimension,
					blockPos,
					blockPos,
					{ includeEntities: false }
				);

				this.structManager.place(structure, dimension, p);
				this.structManager.delete(structure);
			} finally {
				this.tickManager.removeTickingArea(id);
			}

			//as long as the processing happens before the world updates the ref still exists
			resolve(dimension.getBlock(p));
		});
	},


	//function so I don't have to retype stuff
	async _createBlocks(dimension, tempFrom, tempTo, operationCallback, structurePos) {
		const id = `fc_temp_${system.currentTick}_${Math.floor(Math.random() * 1e6)}`;
		const t = { ...structurePos, y: structurePos.y + 1 };
		const writer = "unloadedutils:blocktowrite";

		if (this.structManager.get(writer))
	        this.structManager.delete(writer);

		await this.fastDeclareTickingArea(id, {
		    dimension,
		    from: tempFrom,
		    to: tempTo
		});

		return new Promise((resolve, reject) => {
			try {
				operationCallback();

				//align with P and C ticks to save a tick when I can
				const delay = (((system.currentTick - startUpTick) & 1) === 0) && hasReloaded == false ? 1 : 2;

					//place NBT edited structure block
				this.structManager.place("mystructure:UnloadedWriter", dimension, structurePos);

					//trigger and cleanup
				system.runTimeout(() => {
					dimension.setBlockType(t, "redstone_block");
					system.runTimeout(() => {
						dimension.setBlockType(t, "air");
						dimension.fillBlocks(new BlockVolume(tempFrom, tempTo), "air");
						this.tickManager.removeTickingArea(id);
						resolve();
					}, 3);
				}, delay);
			} catch (e) {
				this.tickManager.removeTickingArea(id);
				throw e; 
			}
		})
	},

	//mojank waits 8 ticks before resolving the promise when it is writable at 3 and readable at 2.
	async fastDeclareTickingArea(id, options, accessedNeeded) {
		return new Promise((resolve, reject) => {
			this.tickManager.createTickingArea(id, options);
			system.runTimeout(() => {
				resolve();
			}, (accessedNeeded === "read" ? 2 : 3));
		})
	},

	//construct virtual block object
	_constructVBlock(block, dimension, location) {
        const parent = this;
        const blockTags = block.getTags();
        const isSolid = block.isSolid;
		
		//... Noot Noot ... *Mozart's Lacrimosa intensifies*
        const VBlock = {
            ...location,
            dimension: dimension,
            location: location,
            typeId: block.typeId,
            isWaterLogged: block.isWaterLogged,
            isAir: block.isAir,
            isLiquid: block.isLiquid,
            isSolid: isSolid,
            localizationKey: block.localizationKey,
            type: { 
                id: block.typeId, 
                localizationKey: block.localizationKey
            },
			permutation: {
				async _return(method, ...param) {
					const { validity, block } = await VBlock._verifyAndReturn()
					if (!validity) return undefined;

                    if (!block) return undefined;
                    return block.permutation[method](...param);
				},
				_flattenMethods() {
					const methods = [
						"getAllStates",
						"getState",
						"canBeDestroyedByLiquidSpread",
						"canContainLiquid",
						"getItemStack",
						"getTags",
						"hasTag",
						"isLiquidBlocking",
						"liquidSpreadCausesSpawn"
					]
					for (const method of methods) {
						this[method] = (...arg) => this._return(method, ...arg);
					}
				},
                type: block.typeId,
				localizationKey: block.localizationKey
            },
            getTags: () => [...blockTags],
            hasTag: (tag) => blockTags.includes(tag),
            async above(steps = 1) { return this._offset(0, steps, 0); },
            async below(steps = 1) { return this._offset(0, -steps, 0); },
            async north(steps = 1) { return this._offset(0, 0, -steps); },
            async south(steps = 1) { return this._offset(0, 0, steps); },
            async east(steps = 1)  { return this._offset(steps, 0, 0); },
            async west(steps = 1)  { return this._offset(-steps, 0, 0); },
            async center() {
				return { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
            },
            bottomCenter() {
                return { x: location.x + 0.5, y: location.y, z: location.z + 0.5 };
            },
            async isValid() {
                return parent.getBlock(this.location, dimension).then(
                    b => b.typeId === this.typeId
                );
            },
			async setType(blockType) {
				if (typeof blockType === 'object') {
					await parent.setBlock(location, dimension, blockType.id);
				} else {
					await parent.setBlock(location, dimension, blockType);
				}
				const updated = await parent.getBlock(location, dimension);
				Object.assign(this, updated);
			},

			async _return(method, ...param) {
				const { validity, block } = await VBlock._verifyAndReturn()
				if (!validity) return undefined;

                if (!block) return undefined;
                return block[method](...param);
			},
			_flattenMethods() {
				const methods = [
					"getComponent",
					"getComponents",
					"getItemStack",
					"hasComponent",
					"getTags",
					"hasTag",
					"isLiquidBlocking",
					"liquidCanFlowFromDirection",
					"liquidSpreadCausesSpawn",
					"matches",
				]
				for (const method of methods) {
					this[method] = (...arg) => this._return(method, ...arg);
				}
			},
			async _verifyAndReturn() {
				const b = await parent._getClonedReference(this.location, dimension)
				return { validity: b.typeId === this.typeId, block: b}
			},
            async _offset(xOffset, yOffset, zOffset) {
                return await parent.getBlock({
                    x: this.location.x + xOffset,
                    y: this.location.y + yOffset,
                    z: this.location.z + zOffset
                }, dimension);
            },
        };

		//expand method callbacks
		VBlock._flattenMethods();
		VBlock.permutation._flattenMethods();
		return VBlock;
    },

	//just clamps block position
	_toBlockPos(pos) {
		return {
			x: Math.floor(pos.x),
			y: Math.floor(pos.y),
			z: Math.floor(pos.z)
		}
	}

}

world.afterEvents.worldLoad.subscribe(() => {
	const players = world.getAllPlayers();
	if (players[0]?.isValid)
		hasReloaded = true;
});
