if (!log) {
	const log = console.log;
}

let dflt_btnIdxs = {
	a: 0,
	b: 1,
	x: 2,
	y: 3,
	l: 4,
	r: 5,
	select: 8,
	start: 9,
	// leftStickBtn: 10,
	// rightStickBtn: 11,
	up: 12,
	down: 13,
	left: 14,
	right: 15
};
let dflt_axeIdxs = {
	leftStick: {
		x: 0,
		y: 1
	},
	rightStick: {
		x: 2,
		y: 3
	},
	// leftTrigger: 4,
	// rightTrigger: 5,
	dpad: 6 // switch pro only
};
let dpadVals = {
	up: -1.0,
	upRight: -0.7142857142857143,
	right: -0.4285714285714286,
	downRight: -0.1428571428571429,
	down: 0.1428571428571428,
	downLeft: 0.4285714285714286,
	left: 0.7142857142857142,
	upLeft: 1.0,
	nuetral: -1.2857142857142856
};
const remappingProfiles = {
	xbox_ps_adaptive: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		},
		disable: 'ps|xbox|pc|arcade'
	},
	nintendo_adaptive: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		},
		enable: 'ps|xbox|pc|arcade'
	},
	xbox_ps_constant: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		}
	},
	nintendo_constant: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		}
	},
	xbox_ps_none: {
		map: {}
	},
	nintendo_none: {
		map: {}
	}
};
let gamepadMaps = {
	xbox_ps: {
		profile: 'none',
		map: {}
	},
	nintendo: {
		profile: 'none',
		map: {}
	},
	other: {
		profile: 'none',
		map: {}
	}
};
let cuis = {};
let mouse;
let mouseWheelDeltaNSS;
let pos = 0;
let uiPrevStates = [];
let uiAfterAlert = '';
let $cur;
let opt = {
	v: true
};

class CUI {
	constructor() {
		this.er = this.error;
		this.err = this.error;
		this.opt = {};
		this.uiPrev = '';
		this.ui = '';
		this.uiSub = '';
		// array of players' contro id
		this.players = [];
		this.contros = {};
		this.context = 'PC';
		this.convertStcksToDpad = false;
	}

	async passthrough() {
		log('override this method: cui.passthrough');
	}
	async onChange() {
		log('override this method: cui.onChange');
	}
	async afterChange() {
		log('override this method: cui.afterChange');
	}
	async onResize() {
		log('override this method: cui.onResize');
	}
	async onAction() {
		log('override this method: cui.onAction');
	}
	async onHeldAction() {
		log('override this method: cui.onHeldAction');
	}
	beforeMove() {
		log('override this method: cui.beforeMove');
	}
	afterMove() {
		log('override this method: cui.afterMove');
	}

	isButton(act) {
		return Object.keys(dflt_btnIdxs).includes(act);
	}

	mapControBtns(contro) {
		let type = contro.type;
		if (type == 'xbox' || type == 'ps') {
			type = 'xbox_ps';
		}
		let gm = gamepadMaps[type];
		gm.profile = contro.profile || gm.profile;
		if (contro.type == 'other') type = 'xbox_ps';
		let prof = remappingProfiles[type + '_' + gm.profile];
		let enable;
		if (prof.enable) {
			enable = new RegExp(`(${prof.enable})`, 'i');
		}
		let disable;
		if (prof.disable) {
			disable = new RegExp(`(${prof.disable})`, 'i');
		}
		// Xbox/PS Adaptive profile usage example:

		// User is currently browsing their Nintendo Switch library
		// Xbox One controller is mapped to
		// Nintendo Switch controller button layout
		//  Y B  ->  X A
		// X A  ->  Y B

		// When browsing Xbox 360 games no mapping occurs
		//  Y B  ->  Y B
		// X A  ->  X A

		// When browsing PS3 games no mapping occurs either
		// since A(Xbox One) auto maps to X(PS3)
		//  Y B  ->  △ ○
		// X A  ->  □ X
		if ((!enable || enable.test(this.context)) && (!disable || !disable.test(this.context))) {
			// log('controller remapping enabled for ' + this.context);
			contro.map = {};
			for (let i in prof.map) {
				contro.map[i] = gm.map[prof.map[i]] || prof.map[i];
			}
		} else {
			// log('no controller remapping for ' + this.context);
			contro.map = {};
		}

		// normalize X and Y to nintendo physical layout
		// this will make the physical layout of an app constant
		// and doAction choices constant for certain buttons
		if (this.opt.normalize &&
			((this.opt.normalize.disable &&
					!(new RegExp(`(${this.opt.normalize.disable})`, 'i')).test(gm.profile)) ||
				(this.opt.normalize.enable &&
					(new RegExp(`(${this.opt.normalize.enable})`, 'i')).test(gm.profile))
			)) {
			for (let i in this.opt.normalize.map) {
				contro.map[i] = gm.map[this.opt.normalize.map[i]] || this.opt.normalize.map[i];
			}
		}
	}

	mapButtons(context) {
		this.context = context || this.context;
		for (let id in this.contros) {
			this.mapControBtns(this.contros[id]);
		}
		this.convertStcksToDpad = /(nes|snes)/.test(this.context);
	}

	getLevel(ui) {
		let level = ui.split('_');
		if (level.length > 1) {
			level = Number(level[1]);
		} else {
			level = 0;
		}
		return level;
	}

	isParent(ui, state) {
		return this.getLevel(ui) < this.getLevel(state);
	}

	getParent(ui) {
		ui = (ui) ? ui : this.ui;
		let curLevel = this.getLevel(ui);
		for (let i = uiPrevStates.length - 1; i >= 0; i--) {
			if (ui == uiPrevStates[i]) continue;
			let prevLevel = this.getLevel(uiPrevStates[i]);
			if (prevLevel > curLevel) continue;
			return uiPrevStates[i];
		}
	}

	async doAction(act) {
		if (this.ui == 'alertMenu_9999' && act == 'a') {
			act = uiAfterAlert;
			uiAfterAlert = '';
			if (act == 'quit') {
				return await this.doAction('quit');
			}
			if (act == 'doubleBack') {
				act = this.getParent(this.getParent());
			}
			if (act) await this.change(act);
			if (!act) await this.doAction('back');
		} else if (act == 'back') {
			await this.change(this.getParent());
		} else if (this.onAction) {
			await this.onAction(act);
		}
	}

	async doHeldAction(act, timeHeld) {
		if (this.onHeldAction) {
			return await this.onHeldAction(act, timeHeld);
		}
	}

	async resize(adjust, state) {
		state = state || this.ui;
		if ((/menu|select/i).test(state)) {
			let $menu = $('#' + state);
			$menu.css('margin-top',
				window.innerHeight * .5 - $menu.outerHeight() * .5);
		}
		if (this.onResize) {
			await this.onResize(adjust);
		}
	}

	getCur(state) {
		return (cuis[state || this.ui] || {}).$cur || $('');
	}

	setMouse(mouseInfo, delta) {
		mouse = mouseInfo;
		mouseWheelDeltaNSS = delta;
	}

	scrollTo(position, time) {
		if (isNaN(position)) {
			log(`pos can't be: ` + position);
			return;
		}
		pos = position;
		// if (this.opt.v) log(pos.toFixed(1));
		time = ((time == undefined) ? 2000 : time);

		let $reels;
		if (/(main|menu)/i.test(this.ui)) {
			$reels = $('#' + this.ui + ' .reel');
		} else if (/select/i.test(this.ui)) {
			$reels = $('#' + this.getParent(this.ui) + ' .reel');
		} else {
			return;
		}
		$('.reel');
		for (let i = 0; i < $reels.length; i++) {
			let $reel = $reels.eq(i);
			let reelPos = pos;
			if (i % 2 == 0) { // is reverse
				reelPos = $reels.eq(1)[0].scrollHeight - window.innerHeight - pos;
			}

			if (time != 0) {
				$reel.stop().animate({
					scrollTop: reelPos
				}, time, 'swing');
			} else {
				$reel[0].scrollTop = reelPos;
			}
		}
	}

	scrollToCursor(time, minDistance) {
		// old behavior
		// if (/menu|select/i.test(this.ui)) return;
		if (this.opt.v) log($cur);
		let $reel = $cur.parent();
		let $reels = $reel.parent().children();
		let position = 0;
		for (let i = 0; i < $cur.index(); i++) {
			position += $reel.children().eq(i).height();
		}
		position += $cur.height() * .5;
		if ($reel.hasClass('reverse')) {
			position = $reels.eq(1)[0].scrollHeight - window.innerHeight - position;
			position += window.innerHeight * .5;
		} else {
			position -= window.innerHeight * .5;
		}
		let scrollDist = Math.abs(pos - position);
		if (minDistance == null) minDistance = .4;
		if (!(/select/i).test(this.ui) &&
			scrollDist < window.innerHeight * minDistance) return;
		let sTime;
		if (time > -1) {
			sTime = time || 1;
		} else {
			sTime = (window.innerHeight * 2 - $cur.height()) / 5;
		}
		if (this.opt.haptic) {
			this.vibrate(76, true);
		}
		this.scrollTo(position, sTime);
	}

	removeCursor() {
		if (!$cur) {
			return;
		}
		$cur.removeClass('cursor');
	}

	makeCursor($cursor, state) {
		if (!$cursor) return;
		state = state || this.ui;
		if (this.beforeMove && $cursor != $cur) {
			this.beforeMove($cur, state);
		}
		this.removeCursor();
		$cur = $cursor;
		$cur.addClass('cursor');
		if (!cuis[state]) cuis[state] = {};
		cuis[state].$cur = $cur;
		if (this.afterMove) {
			this.afterMove($cursor, state);
		}
	}

	addView(state, options) {
		cuis[state] = options;
		this.addListeners('#' + state);
	}

	editView(state, options) {
		cuis[state] = options;
	}

	removeView(state) {
		$('#' + state).empty();
		if ((/main/i).test(state)) {
			this.uiPrev = null;
		}
	}

	/**
	 * Summary.
	 * @param {String}  state          state of the UI.
	 * @param {String}  subState       subState of the UI.
	 * @param {Object}  [options={}]
	 * @param {Boolean} [options.keepBackground=false]
	 * @return void
	 */
	async change(state, subState, options) {
		options = options || {};
		if (state == this.ui) {
			await this.doAction('b');
			return;
		}
		if (this.ui) uiPrevStates.push(this.ui);
		this.uiPrev = this.ui;
		$('#' + state).show();
		if (this.onChange) {
			await this.onChange(state, subState || this.uiSub);
		}
		if ((/main/gi).test(state)) {
			if (!cuis[state].$cur || !$('body').find(cuis[state].$cur).length) {
				let $mid = $('#' + state + ' .reel.r0').children();
				$mid = $mid.eq(Math.round($mid.length * .5) - 1);
				this.makeCursor($mid, state);
			} else {
				this.makeCursor(cuis[state].$cur, state);
			}
			this.scrollToCursor(0, 0);
		} else if (/select/i.test(state)) {
			this.makeCursor(cuis[this.getParent(state)].$cur, state);
		} else {
			let $temp;
			$temp = $(`#${state}.row-y`).eq(0).find('.uie').eq(0);
			if (!$temp.length) {
				$temp = $(`#${state}.row-x`).eq(0).find('.uie').eq(0);
			}
			if (!$temp.length) {
				$temp = $(`#${state} .row-y`).eq(0).find('.uie').eq(0);
			}
			if (!$temp.length) {
				$temp = $(`#${state} .row-x`).eq(0).find('.uie').eq(0);
			}
			this.makeCursor($temp, state);
		}
		$('body').removeClass(this.ui);
		$('body').addClass(state);
		if (subState) {
			$('body').removeClass(this.uiSub);
			$('body').addClass(subState);
		}
		this.resize(true, state);
		let isChild = !this.isParent(this.ui, state);
		if (this.ui && !options.keepBackground &&
			/menu/i.test(this.ui) &&
			(!cuis[this.ui].keepBackground || isChild) &&
			(!/select/i.test(state) || isChild)) {
			// $('.cui:not(.main)').hide();
			$('#' + this.ui).hide();
			$('.' + this.ui).hide();
		} else {
			// log('keeping prev ui in background');
		}
		this.ui = state;
		this.uiSub = subState || this.uiSub;
		if (this.opt.v) {
			log(this.uiPrev + ' to ' + state);
		}
		if (this.afterChange) {
			await this.afterChange();
		}
	}

	addListeners(id) {
		if (!id) id = '';
		var _this = this;
		$(id + ' .uie').click(function() {
			let classes = $(this).attr('class').split(' ');
			if (classes.includes('uie-disabled')) return;
			_this.makeCursor($(this));
			_this.buttonPressed('a');
		});
		$(id + ' .uie').hover(function() {
			if (!cuis[_this.ui].hoverCurDisabled &&
				$(this).parents('#' + _this.ui).length) {
				_this.makeCursor($(this));
			}
		});
	}

	async _move(direction) {
		document.body.requestPointerLock();
		let $rowX = $cur.closest('.row-x');
		let $rowY = $cur.closest('.row-y');
		let curX, curY, maxX, maxY;
		let inVerticalRow = $rowX.has($rowY.get(0)).length || !$rowX.length;
		if (inVerticalRow) {
			curX = $rowX.find('.row-y').index($rowY);
			maxX = $rowX.find('.row-y').length;
			curY = $rowY.find('.uie').index($cur);
			maxY = $rowY.find('.uie').length;
		} else {
			curX = $rowX.find('.uie').index($cur);
			maxX = $rowX.find('.uie').length;
			curY = $rowY.find('.row-x').index($rowX);
			maxY = $rowY.find('.row-x').length;
		}
		let x = curX;
		let y = curY;
		switch (direction.toLowerCase()) {
			case 'up':
				y -= 1;
				break;
			case 'down':
				y += 1;
				break;
			case 'left':
				x -= 1;
				break;
			case 'right':
				x += 1;
				break;
			default:
		}
		let ret = {
			$cur: $cur,
			$rowX: $rowX,
			$rowY: $rowY
		};
		if (x < 0) x = maxX - 1;
		if (y < 0) y = maxY - 1;
		if (x >= maxX) x = 0;
		if (y >= maxY) y = 0;
		// find scale if menu is scaled
		let scale;
		let transform = $cur.parent().parent().css('transform');
		if (transform) {
			let matches = transform.match(/scale\(([\d\.]+)/);
			if (!matches) matches = transform.match(/matrix\(([\d\.]+)/);
			if (matches) {
				scale = Number(matches[1]); // divide by scale
			}
		}
		if (!scale) scale = 1;

		if (this.opt.haptic) {
			this.vibrate(50, false);
		}

		if (inVerticalRow) {
			if (x == curX) {
				ret.$cur = $rowY.find('.uie').eq(y);
			} else {
				if (!$rowX.length) return;
				ret.$rowY = $rowX.find('.row-y').eq(x);
				if (!ret.$rowY.length) return;
				let curRect = $cur.get(0).getBoundingClientRect();
				let rowYLength = ret.$rowY.find('.uie').length;
				if (y >= rowYLength) y = Math.floor(rowYLength / 2);
				while (y < rowYLength && y >= 0) {
					ret.$cur = ret.$rowY.find('.uie').eq(y);
					let elmRect = ret.$cur.get(0).getBoundingClientRect();
					let diff = (curRect.top - elmRect.top) / scale;
					let halfHeight = Math.max($cur.height(), ret.$cur.height()) * .6;
					if (halfHeight < diff) {
						y++;
					} else if (-halfHeight > diff) {
						y--;
					} else {
						break;
					}
				}
			}
		} else {
			if (y == curY) {
				ret.$cur = $rowX.find('.uie').eq(x);
			} else {
				if (!$rowY.length) return;
				ret.$rowX = $rowY.find('.row-x').eq(y);
				if (!ret.$rowX.length) return;
				let curRect = $cur.get(0).getBoundingClientRect();
				let rowXLength = ret.$rowX.find('.uie').length;
				if (x >= rowXLength) x = Math.floor(rowXLength / 2);
				while (x < rowXLength && x >= 0) {
					ret.$cur = ret.$rowX.find('.uie').eq(x);
					let elmRect = ret.$cur.get(0).getBoundingClientRect();
					let diff = (curRect.left - elmRect.left) / scale;
					let halfWidth = Math.max($cur.width(), ret.$cur.width()) * .6;
					if (halfWidth < diff) {
						x++;
					} else if (-halfWidth > diff) {
						x--;
					} else {
						break;
					}
				}
			}
		}
		if (!ret.$cur.length) return;
		this.makeCursor(ret.$cur);
		this.scrollToCursor();
		return true;
	}

	async move(direction) {
		// TODO enable only if game wants to
		// auto-map left stick to dpad
		// contro.btnStates[direction] = contro.btnStates[direction] || 1;

		let res = await this._move(direction);
		await this.doAction(direction);
	}

	async buttonPressed(btn) {
		if (typeof btn == 'string') {
			btn = {
				label: btn
			};
		}
		let lbl = btn.label.toLowerCase();
		if (lbl == 'view') {
			lbl = 'select';
		}
		switch (lbl) {
			case 'up':
			case 'down':
			case 'left':
			case 'right':
				await this.move(lbl);
				break;
			case 'a':
			case 'b':
			case 'x':
			case 'y':
			case 'select':
			case 'start':
				await this.doAction(lbl);
				break;
			default:
				if (this.opt.v) log('button does nothing');
				return;
		}
	}

	async buttonHeld(btn, timeHeld) {
		if (typeof btn == 'string') {
			btn = {
				label: btn
			};
		}
		let lbl = btn.label.toLowerCase();
		if (lbl == 'view') {
			lbl = 'select';
		}
		let res = false;
		switch (lbl) {
			case 'a':
			case 'up':
			case 'down':
			case 'left':
			case 'right':
			case 'b':
			case 'x':
			case 'y':
			case 'select':
			case 'start':
				res = await this.doHeldAction(lbl, timeHeld);
				break;
			default:
				if (this.opt.v) log('button does nothing');
				return;
		}
		return res;
	}

	parseBtns(contro, btns) {
		for (let i in btns) {
			let btn = btns[i];
			let query;
			// incomplete maps are okay
			// no one to one mapping necessary
			i = contro.map[i] || i;
			let isDpadBtn = /(up|down|left|right)/.test(i);
			if (contro.subtype != 'switch-pro' || !isDpadBtn) {
				query = btn.pressed;
			} else {
				query = (Math.abs(dpadVals[i] - contro.pad.axes[9]) < 0.1);
			}
			// if button is not pressed, query is false and unchanged
			if (!contro.btnStates[i] && !query) continue;
			// if button press ended query is false
			if (!query &&
				(!isDpadBtn || !this.convertStcksToDpad ||
					(/(up|down)/.test(i) && contro.stickNue.y) ||
					(/(left|right)/.test(i) && contro.stickNue.x))) {
				// log(i + ' button press end');
				contro.btnStates[i] = 0;
				continue;
			}
			// if button is held, query is true and unchanged
			// save button state change
			contro.btnStates[i] += 1;
			if (contro.btnStates[i] == 1) {
				this.buttonPressed(i);
			} else {
				this.buttonHeld(i, contro.btnStates[i] * 16);
			}

			if (!this.players.includes(contro.id)) {
				this.players.push(contro.id);
			}
		}
	}

	sticks(contro, stks) {
		if (contro.disableSticks) return;
		let didMove = false;
		let vect = stks.left;
		let stickNue = contro.stickNue;
		if (vect.y < -.5) {
			// used to move in contro-ui menus
			if (stickNue.y) this.move('up');
			// converts stick movement to dpad button presses
			// when using passthrough for certain contexts
			if (this.convertStcksToDpad) contro.btnStates.up++;
			stickNue.y = false;
		} else if (vect.y > .5) {
			if (stickNue.y) this.move('down');
			if (this.convertStcksToDpad) contro.btnStates.down++;
			stickNue.y = false;
		} else {
			stickNue.y = true;
		}
		if (vect.x < -.5) {
			if (stickNue.x) this.move('left');
			if (this.convertStcksToDpad) contro.btnStates.left++;
			stickNue.x = false;
		} else if (vect.x > .5) {
			if (stickNue.x) this.move('right');
			if (this.convertStcksToDpad) contro.btnStates.right++;
			stickNue.x = false;
		} else {
			stickNue.x = true;
		}
	}

	parse(contro, btns, stks, trigs) {
		if (!this.contros[contro.id]) {
			contro = this.addContro(contro);
			this.mapControBtns(contro);
		} else {
			contro = this.contros[contro.id];
		}
		this.parseBtns(contro, btns);
		this.sticks(contro, stks);

		if (!this.passthrough) return;

		for (let i in this.players) {
			if (contro.id != this.players[i]) continue;
			this.passthrough({
				port: Number(i),
				btns: contro.btnStates,
				stks: stks,
				trigs: trigs
			});
		}
	}

	vibrate(duration, strongly) {
		if (!this.players[0]) return;
		let contro = this.contros[this.players[0]];
		if (contro.subtype == 'gca') return;
		const actuator = contro.pad.vibrationActuator;
		if (!actuator || actuator.type !== 'dual-rumble') return;

		actuator.playEffect('dual-rumble', {
			startDelay: 0,
			duration: duration,
			weakMagnitude: strongly ? 1 : 0,
			strongMagnitude: strongly ? 1 : 0
		});
	}

	makePlayer1(contro) {
		disconnectPlayer(contro);
		this.players.unshift(contro.id);
	}

	disconnectPlayer(contro) {
		for (let i in this.players) {
			if (contro.id != this.players[i]) continue;
			this.players.splice(1, i);
		}
	}

	pollContro(contro) {
		if (contro.subtype == 'gca') return;
		contro.pad = navigator.getGamepads()[contro.id];
		// gamepad disconnected
		if (!contro.pad) {
			disconnectPlayer(contro);
			return;
		}
		let btns = {};
		let pad = contro.pad;
		for (let i in contro.btnIdxs) {
			btns[i] = pad.buttons[contro.btnIdxs[i]];
		}
		let stks = {
			left: {
				x: pad.axes[contro.axeIdxs.leftStick.x],
				y: pad.axes[contro.axeIdxs.leftStick.y]
			},
			right: {
				x: pad.axes[contro.axeIdxs.leftStick.x],
				y: pad.axes[contro.axeIdxs.leftStick.y]
			}
		};
		let trigs;
		this.parse(contro, btns, stks, trigs);
	}

	loop() {
		for (let id in this.contros) {
			this.pollContro(this.contros[id]);
		}
		var _this = this;
		requestAnimationFrame(() => {
			_this.loop();
		});
	}

	addContro(contro) {
		contro.pad = navigator.getGamepads()[contro.id] || contro.pad;
		contro.type = contro.type || 'other';
		contro.profile = contro.profile || null;
		contro.disableSticks = false;
		contro.btnIdxs = contro.btnIdxs || dflt_btnIdxs;
		contro.axeIdxs = contro.axeIdxs || dflt_axeIdxs;
		let id = contro.pad.id;
		if ((/xbox/i).test(id)) {
			contro.type = 'xbox';
		} else if (/(ps\d|playstation)/i.test(id)) {
			contro.type = 'ps';
		} else if (/(nintendo|wii|switch|joy *con)/i.test(id)) {
			contro.type = 'nintendo';
		} else if (/plus/i.test(id)) {
			let btnIdxs = contro.btnIdxs;
			btnIdxs.a = 1;
			btnIdxs.b = 2;
			btnIdxs.x = 0;
			btnIdxs.y = 3;
			btnIdxs.l = 4;
			btnIdxs.r = 5;
			btnIdxs.select = 8;
			btnIdxs.start = 9;
			contro.type = 'nintendo';
			contro.subtype = 'switch-pro';
		}
		// initialize button states
		contro.btnStates = {};
		for (let i in contro.btnIdxs) {
			contro.btnStates[i] = 0;
		}
		contro.stickNue = {
			x: true,
			y: true
		}
		contro.map = contro.map || {};
		log('controller detected: ' + id);
		log('using the ' + contro.type + ' gamepad mapping profile');
		this.contros[contro.id] = contro;
		if (this.opt.haptic) {
			this.vibrate(100, true);
		}
		// if (this.onChange) {
		// 	this.onChange(this.ui, this.uiSub);
		// }
		return this.contros[contro.id];
	}

	start(options) {
		this.opt = options || {};
		gamepadMaps = this.opt.gamepadMaps || gamepadMaps;
		let _this = this;
		window.addEventListener('gamepadconnected', (e) => {
			let contro = _this.addContro({
				id: e.gamepad.index
			});
			_this.mapControBtns(contro);
		});
		if (this.opt.gca) {
			this.gca = require('./gca.js');
			try {
				this.gca.init();
			} catch (ror) {
				er(ror);
			}
		}
		this.addListeners();
		this.loop();
		$(window).resize(this.resize);
	};

	bind(binding, act) {
		if (binding == 'wheel') {
			window.addEventListener('wheel', (event) => {
				event.preventDefault();
				event.stopPropagation();
				if ($('.uie.selected').length) return false;
				let scrollDelta = event.deltaY;
				// log(event);
				if (mouse.wheel.smooth) {
					pos += scrollDelta * mouse.wheel.multi;
				} else {
					if (scrollDelta < 0) {
						pos += mouseWheelDeltaNSS;
					} else {
						pos -= mouseWheelDeltaNSS;
					}
				}
				this.scrollTo(pos, ((!mouse.wheel.smooth) ? 1500 : 0));
				return false;
			}, {
				passive: false
			});
		} else {
			Mousetrap.bind(binding, () => {
				if (/(up|down|left|right)/.test(act)) {
					this.move(act);
				} else {
					this.doAction(act);
				}
				return false;
			});
		}
	}

	click(elem, act) {
		$(elem).click(() => {
			this.buttonPressed(act);
		});
		// $(elem).bind('mouseheld', function(e) {
		// 	this.buttonHeld(act, 2000);
		// });
	}

	async alert(msg, title, stateAfterAlert) {
		if (typeof msg != 'string') return;
		uiAfterAlert = stateAfterAlert;
		log(msg);
		let $alertMenu = $('#alertMenu_9999');
		if (!$alertMenu.length) {
			$('body').prepend(`
				<div class="menu" id="alertMenu_9999">
  				<div class="row-y">
        		<div class="uie opt0" name="alert-okay">Okay</div>
    			</div>
				</div>`);
			$alertMenu = $('#alertMenu_9999');
			$alertMenu.prepend(`<h1>Alert</h1><p>default alert</p>`);
			this.addListeners('#alertMenu_9999');
		}
		$('#alertMenu_9999 > :not(.row-y)').remove();
		if (/<[^>]*>/.test(msg)) {
			$('#alertMenu_9999').prepend(msg);
		} else {
			let msgArr = msg.split('\n');
			for (let i = msgArr.length - 1; i >= 0; i--) {
				$('#alertMenu_9999').prepend(`<p>${msgArr[i]}</p>`);
			}
		}
		$('#alertMenu_9999').prepend(`<h1>${title}</h1>`);
		await this.change('alertMenu_9999');
		if (stateAfterAlert == 'quit') {
			$('#alertMenu_9999 .opt0').text('close');
			// stop
			await delay(100000000000);
		}
	}

	async error(msg, code, stateAfterError) {
		let title;
		if (typeof code == 'string') {
			title = code;
		} else if (code) {
			title = 'Error Code ' + code;
		} else {
			title = 'Error';
		}
		await this.alert(msg, title, stateAfterError);
	}
}

module.exports = new CUI();
