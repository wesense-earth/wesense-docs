import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'WeSense Docs',
  description: 'Guides for contributors, operators, and developers of the WeSense environmental sensor network',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logos/logo-solid-dark-cropped.png' }],
  ],

  themeConfig: {
    logo: '/logos/logo-solid-dark-cropped.png',
    siteTitle: 'WeSense',

    nav: [
      { text: 'Features', link: '/features' },
      { text: 'Get Started', link: '/getting-started/quick-start' },
      { text: 'Run a Station', link: '/station-operators/operate-a-station' },
      { text: 'Develop', link: '/developers/architecture' },
      { text: 'Live Map', link: 'https://map.wesense.earth/#map&zoom=3' },
      { text: 'wesense.earth', link: 'https://wesense.earth' },
    ],

    sidebar: [
      {
        text: 'Overview',
        collapsed: false,
        items: [
          { text: 'Features', link: '/features' },
        ],
      },
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Quick Start', link: '/getting-started/quick-start' },
          { text: 'Recommended Sensors', link: '/getting-started/recommended-sensors' },
        ],
      },
      {
        text: 'Build a WeSense Node',
        collapsed: false,
        items: [
          { text: 'Hardware Setup', link: '/getting-started/build-wesense-node' },
          { text: 'Firmware Setup', link: '/getting-started/firmware-setup' },
          { text: 'Firmware Configuration', link: '/getting-started/firmware-configuration' },
          { text: 'Managing Your Sensor', link: '/getting-started/managing-your-sensor' },
          { text: 'Firmware Updates', link: '/getting-started/firmware-update' },
        ],
      },
      {
        text: 'Add a Meshtastic Node',
        collapsed: true,
        items: [
          { text: 'Overview & MQTT Setup', link: '/getting-started/meshtastic-node' },
        ],
      },
      {
        text: 'Contribute Home Assistant Data',
        collapsed: true,
        items: [
          { text: 'Home Assistant / Ecowitt', link: '/getting-started/home-assistant' },
        ],
      },
      {
        text: 'Station Operators',
        collapsed: false,
        items: [
          { text: 'Operate a Station', link: '/station-operators/operate-a-station' },
          { text: 'Deployment Profiles', link: '/station-operators/deployment-profiles' },
          { text: 'Contribution Tiers', link: '/station-operators/contribution-tiers' },
          { text: 'Meshtastic Gateway', link: '/getting-started/meshtastic-gateway' },
        ],
      },
      {
        text: 'Developers',
        collapsed: false,
        items: [
          { text: 'Architecture Overview', link: '/developers/architecture' },
          { text: 'Ingesters', link: '/developers/ingesters' },
          { text: 'Writing an Ingester', link: '/developers/writing-an-ingester' },
          { text: 'Data Schema Reference', link: '/developers/data-schema' },
          { text: 'Contributing Code', link: '/developers/contributing-code' },
        ],
      },
      {
        text: 'Hardware',
        collapsed: true,
        items: [
          { text: 'Board Configurations', link: '/hardware/board-configurations' },
          { text: 'Enclosure Designs', link: '/hardware/enclosure-designs' },
          { text: 'Sensor Specifications', link: '/hardware/sensor-specs' },
        ],
      },
      {
        text: 'Data',
        collapsed: true,
        items: [
          { text: 'Accessing Data', link: '/data/accessing-data' },
          { text: 'Why Durability Over Accuracy', link: '/data/why-durability-over-accuracy' },
        ],
      },
      {
        text: 'About',
        collapsed: true,
        items: [
          { text: 'Privacy Policy', link: '/about/privacy-policy' },
          { text: 'Terms of Service', link: '/about/terms-of-service' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/wesense-earth' },
      { icon: 'mastodon', link: 'https://mastodon.wesense.earth/@wesense' },
    ],

    editLink: {
      pattern: 'https://github.com/wesense-earth/wesense-docs/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'All WeSense data is free and open, forever.',
      copyright: 'Released under the MIT License',
    },
  },
})
