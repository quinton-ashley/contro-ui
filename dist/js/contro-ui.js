if (!log) {
	const log = console.log;
}
const {
	Mouse,
	Keyboard,
	Gamepad,
	or,
	and
} = require('contro');
let gamepad = new Gamepad();

if (!jQuery) {
	console.error('contro-ui requires jquery');
	return;
}
// https://stackoverflow.com/questions/4080497/how-can-i-listen-for-a-click-and-hold-in-jquery
(function($) {
	function startTrigger(e) {
		var $elem = $(this);
		$elem.data('mouseheld_timeout', setTimeout(function() {
			$elem.trigger('mouseheld');
		}, e.data));
	}

	function stopTrigger() {
		var $elem = $(this);
		clearTimeout($elem.data('mouseheld_timeout'));
	}

	var mouseheld = $.event.special.mouseheld = {
		setup: function(data) {
			// the first binding of a mouseheld event on an element will trigger this
			// lets bind our event handlers
			var $this = $(this);
			$this.bind('mousedown', +data || mouseheld.time, startTrigger);
			$this.bind('mouseleave mouseup', stopTrigger);
		},
		teardown: function() {
			var $this = $(this);
			$this.unbind('mousedown', startTrigger);
			$this.unbind('mouseleave mouseup', stopTrigger);
		},
		time: 750 // default to 750ms
	};
})(jQuery);

let btnNames = [
	'a', 'b', 'x', 'y',
	'up', 'down', 'left', 'right',
	'view', 'start'
];
let btns = {};
for (let i of btnNames) {
	btns[i] = gamepad.button(i);
}
let btnStates = {};
for (let i of btnNames) {
	btnStates[i] = false;
}
let stickNue = {
	x: true,
	y: true
};
let cuis = {};
let mouse;
let mouseWheelDeltaNSS;
let pos = 0;
let uiPrevStates = [];
let uiAfterError = '';
let $cur;

let map = {};
const remappingProfiles = {
	Xbox_PS_Adaptive: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		},
		disable: 'ps|xbox|pc|mame'
	},
	Nintendo_Adaptive: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		},
		enable: 'ps|xbox|pc|mame'
	},
	Xbox_PS_Consistent: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		}
	},
	Nintendo_Consistent: {
		map: {
			a: 'b',
			b: 'a',
			x: 'y',
			y: 'x'
		}
	},
	Xbox_PS_None: {
		map: {}
	},
	Nintendo_None: {
		map: {}
	}
};
let gamepadMaps = {
	default: {
		profile: 'Xbox_PS_Adaptive',
		map: {}
	}
};
let context = 'PC';
let opt = {
	v: true
};

class CUI {
	constructor() {
		this.opt = {};
		this.uiPrev = '';
		this.ui = '';
		this.uiSub = '';
		this.gamepadConnected = false;
		this.gamepadType = 'default';
		this.disableSticks = false;
		this.er = this.error;
		this.err = this.error;
	}

	async onChange() {
		log('override this method: onChange');
	}
	async afterChange() {
		log('override this method: afterChange');
	}
	async onResize() {
		log('override this method: onResize');
	}
	async onAction() {
		log('override this method: onAction');
	}
	async onHeldAction() {
		log('override this method: onHeldAction');
	}

	mapButtons(system) {
		context = system || context;
		let pad = gamepadMaps[this.gamepadType];
		let prof = remappingProfiles[pad.profile];
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
		if ((!enable || enable.test(context)) && (!disable || !disable.test(context))) {
			// log('controller remapping enabled for ' + context);
			map = {};
			for (let i in prof.map) {
				map[i] = pad.map[prof.map[i]] || prof.map[i];
			}
		} else {
			// log('no controller remapping for ' + context);
			map = {};
		}

		// normalize X and Y to nintendo physical layout
		// this will make the physical layout of an app consistent
		// and doAction choices consistent for certain buttons
		if (this.opt.normalize &&
			((this.opt.normalize.disable &&
					!(new RegExp(`(${this.opt.normalize.disable})`, 'i')).test(pad.profile)) ||
				(this.opt.normalize.enable &&
					(new RegExp(`(${this.opt.normalize.enable})`, 'i')).test(pad.profile))
			)) {
			for (let i in this.opt.normalize.map) {
				map[i] = pad.map[this.opt.normalize.map[i]] || this.opt.normalize.map[i];
			}
		}
	}

	async doAction(act) {
		if (act == 'error-okay' || act == 'back') {
			if (uiAfterError) {
				this.change(uiAfterError);
				return;
			}
			for (let i = uiPrevStates.length - 1; i >= 0; i--) {
				if (this.ui != uiPrevStates[i]) {
					this.change(uiPrevStates[i]);
					return;
				}
			}
		} else {
			if (this.onAction) {
				await this.onAction(act, btnNames.includes(act));
			}
		}
	}

	async doHeldAction(act, timeHeld) {
		if (this.onHeldAction) {
			return await this.onHeldAction(act, btnNames.includes(act), timeHeld);
		}
	}

	async resize(adjust, state) {
		state = state || this.ui;
		if ((/menu/gi).test(state)) {
			let $menu = $('#' + state);
			$menu.css('margin-top',
				$(window).height() * .5 - $menu.outerHeight() * .5);
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
		time = ((time == undefined) ? 2000 : time);
		if (time == 0) time = 100;
		let options = {
			duration: time,
			fill: 'forwards',
			easing: (time == 100) ? 'ease-out' : 'ease-in-out'
		};
		let $reels = $('.reel');
		for (let i = 0; i < $reels.length; i++) {
			let $reel = $reels.eq(i);
			let attr = ($reel.hasClass('reverse')) ? 'bottom' : 'top';
			$reel[0].animate({
				[attr]: [$reel.css(attr), -pos + 'px']
			}, options);
		}
	}

	scrollToCursor(time, minDistance) {
		if ((/menu/gi).test(this.ui)) return;
		if (this.opt.v) log($cur);
		let $reel = $cur.parent();
		let position = 0;
		for (let i = 0; i < $cur.index(); i++) {
			position += $reel.children().eq(i).height();
		}
		position += $cur.height() * .5;
		if ($reel.hasClass('reverse')) {
			position += $(window).height() * .5;
			position = $reel.height() - position;
		} else {
			position -= $(window).height() * .5;
		}
		let scrollDist = Math.abs(pos - position);
		if (minDistance == null) minDistance = .4;
		if (scrollDist < $(window).height() * minDistance) return;
		let sTime;
		if (time > -1) {
			sTime = time || 1;
		} else {
			sTime = ($(window).height() * 2 - $cur.height()) / 5;
		}
		if (time == undefined && scrollDist > $cur.height() * 1.1) {
			sTime += scrollDist;
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
		this.removeCursor();
		$cur = $cursor;
		$cur.addClass('cursor');
		if (!cuis[state || this.ui]) cuis[state || this.ui] = {};
		cuis[state || this.ui].$cur = $cur;
	}

	addView(state, options) {
		cuis[state] = options;
		this.addListeners('#' + state);
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
			this.doAction('b');
			return;
		}
		$('#' + state).show();
		if (this.onChange) {
			await this.onChange(state, subState || this.uiSub, this.gamepadConnected);
		}
		if ((/main/gi).test(state)) {
			if (this.ui == 'errMenu' || (!(/select/gi).test(this.ui) && !(/menu/gi).test(this.ui))) {
				let $mid = $('#' + state + ' .reel.r0').children();
				$mid = $mid.eq(Math.round($mid.length * .5) - 1);
				this.makeCursor($mid, state);
			} else {
				this.makeCursor(cuis[state].$cur, state);
			}
			this.scrollToCursor(0, 0);
		} else if ((/select/gi).test(state)) {
			this.makeCursor(cuis[this.ui].$cur, state);
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
		if (this.ui && !options.b && !options.keepBackground &&
			!(/select/gi).test(state) && !(/menu/gi).test(state) || (/menu/gi).test(this.ui)) {
			// $('.cui:not(.main)').hide();
			$('#' + this.ui).hide();
			$('.' + this.ui).hide();
		} else {
			// log('keeping prev ui in background');
		}
		if (this.ui) uiPrevStates.push(this.ui);
		this.uiPrev = this.ui;
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

	async move(direction) {
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
					let diff = curRect.top - elmRect.top;
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
					let diff = curRect.left - elmRect.left;
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
				this.move(lbl);
				break;
			case 'a':
			case 'enter':
				await this.doAction($cur.attr('name') || 'a');
				break;
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
			case 'enter':
				res = await this.doHeldAction($cur.attr('name') || 'a', timeHeld);
				break;
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

	async parseBtns(btns) {
		for (let i in btns) {
			let btn = btns[i];
			// incomplete maps are okay
			// no one to one mapping necessary
			i = map[i] || i;

			let query;
			if (typeof btn == 'boolean') {
				query = btn;
			} else {
				query = btn.query();
			}
			// if button is not pressed, query is false and unchanged
			if (!btnStates[i] && !query) continue;
			// if button press ended query is false
			if (!query) {
				// log(i + ' button press end');
				btnStates[i] = 0;
				continue;
			}
			// if button is held, query is true and unchanged
			if (btnStates[i] && query) {
				btnStates[i] += 1;
				if (await this.buttonHeld(i, btnStates[i] * 16)) {
					btnStates[i] = 0;
				}
				continue;
			}
			// save button state change
			btnStates[i] += 1;
			// if button press just started, query is true
			if (this.opt.v) log(i + ' button press start');
			await this.buttonPressed(i);
		}
	}

	sticks(stks) {
		if (this.disableSticks) return;
		let didMove = false;
		let vect = stks.left;
		if (vect.y < -.5) {
			if (stickNue.y) this.move('up');
			stickNue.y = false;
		}
		if (vect.y > .5) {
			if (stickNue.y) this.move('down');
			stickNue.y = false;
		}
		if (vect.x < -.5) {
			if (stickNue.x) this.move('left');
			stickNue.x = false;
		}
		if (vect.x > .5) {
			if (stickNue.x) this.move('right');
			stickNue.x = false;
		}
		if (vect.x < .5 &&
			vect.x > -.5) {
			stickNue.x = true;
		}
		if (vect.y < .5 &&
			vect.y > -.5) {
			stickNue.y = true;
		}
	}

	async parse(btns, stks, trigs, type) {
		if (type && this.gamepadType != type) {
			let res = false;
			for (let i in btns) {
				let btn = btns[i];
				let val;
				if (typeof btn == 'boolean') {
					val = btn;
				} else {
					val = btn.query();
				}
				if (val) {
					res = true;
				}
			}
			if (res) {
				this.gamepadType = type;
				this.mapButtons();
			} else {
				return;
			}
		}

		await this.parseBtns(btns);
		this.sticks(stks);
	}

	async loop() {
		let type = this.gamepadType;
		if (!this.gamepadConnected && gamepad.isConnected()) {
			if ((/xbox/i).test(gamepad.gamepad.id)) {
				type = 'xbox';
			} else if ((/(ps\d|playstation)/i).test(gamepad.gamepad.id)) {
				type = 'ps';
			} else if ((/(nintendo|switch|joy *con|gamecube)/i).test(gamepad.gamepad.id)) {
				type = 'nintendo';
			}
			log('controller detected: ' + gamepad.gamepad.id);
			log('using the ' + type + ' gamepad mapping profile');
			if (this.onChange) {
				await this.onChange(this.ui, this.uiSub, true);
			}
			$('html').addClass('cui-this.gamepadConnected');
			this.gamepadConnected = true;
		}
		if (this.gamepadConnected || gamepad.isConnected()) {
			let stks = {
				left: gamepad.stick('left').query(),
				right: gamepad.stick('right').query()
			};
			let trigs;
			await this.parse(btns, stks, trigs, type);
		}
		var _this = this;
		requestAnimationFrame(function() {
			_this.loop();
		});
	}

	start(options) {
		this.opt = options || {};
		gamepadMaps = this.opt.gamepadMaps || gamepadMaps;
		if (this.opt.gca) {
			try {
				require('./gca.js')();
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
				this.scrollTo(pos, ((!mouse.wheel.smooth) ? 2000 : 0));
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

	error(msg, code, stateAfterError) {
		uiAfterError = stateAfterError;
		log(msg);
		let $errMenu = $('#errMenu');
		if (!$errMenu.length) {
			$('body').append(`
				<div class="menu" id="errMenu">
  				<div class="row-y">
        		<div class="uie" name="error-okay">Okay</div>
    			</div>
				</div>`);
			$errMenu = $('#errMenu');
			$errMenu.prepend(`<h1>Error</h1><p>unknown error</p>`);
			this.addListeners('#errMenu');
		}
		$('#errMenu h1').remove();
		$('#errMenu p').remove();
		let msgArr = msg.split('\n');
		for (let i = msgArr.length - 1; i >= 0; i--) {
			$('#errMenu').prepend(`<p>${msgArr[i]}</p>`);
		}
		if (code) {
			$('#errMenu').prepend(`<h1>Error Code ${code}</h1>`);
		} else {
			$('#errMenu').prepend(`<h1>Error</h1>`);
		}
		this.change('errMenu');
	}
}

module.exports = new CUI();
