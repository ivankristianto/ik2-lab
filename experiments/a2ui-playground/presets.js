// Canned agent responses. Each one shows a different part of the A2UI basic catalog.
import { BASIC_CATALOG } from './protocol.js';

const surface = (surfaceId, components, dataModel) => ({
  version: '1.0',
  createSurface: { surfaceId, catalogId: BASIC_CATALOG, ...(dataModel ? { dataModel } : {}), components },
});

const text = (id, value, variant) => ({ id, component: 'Text', text: value, ...(variant ? { variant } : {}) });
const path = (p) => ({ '@path': p });
const call = (name, args) => ({ '@call': name, args });

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
    ] }), message: 'Fill in the fields above first.' }] },
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

// Broken on purpose: an unsupported component and a child id nothing defines.
const broken = [surface('promo', [
  { id: 'root', component: 'Column', children: ['hero', 'cta'] },
  { id: 'hero', component: 'Image', url: 'https://example.com/a.jpg' },
  { id: 'cta', component: 'Button', child: 'cta_label', action: { event: { name: 'buy' } } },
])];

export const PRESETS = [
  { id: 'contact', label: 'contact form', messages: contact },
  { id: 'reading', label: 'reading list', messages: reading },
  { id: 'booking', label: 'booking confirmation', messages: booking, replies: { confirmBooking: bookingReply } },
  { id: 'settings', label: 'settings with tabs', messages: settings },
  { id: 'broken', label: 'broken response', messages: broken },
];

export const toJSON = (messages) => JSON.stringify(messages, null, 2);
