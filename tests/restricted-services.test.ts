import test from "node:test";
import assert from "node:assert/strict";
import { restrictedMatch, isRestrictedService, splitRestricted } from "../src/lib/restricted-services";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const category = (name: string) => restrictedMatch(name, slugify(name))?.category ?? null;

test("trading, forex and investment services are blocked", () => {
  for (const name of [
    "Forex", "Forex4You", "ForexTime", "Exness", "IQ Option", "IQOption", "Olymp Trade", "OlympTrade", "Quotex",
    "Pocket Option", "Binomo", "Deriv", "XM", "FBS", "HFM", "XTB", "MetaTrader 5", "Plus500", "eToro", "Pepperstone",
    "Binary Options", "Binary Options Trading", "CFD Trading", "AvaTrade", "Capital.com", "IC Markets", "RoboForex",
    "Tradingview", "Trading212", "Trade Republic", "Copy Trading", "Stock Trading", "Stocks", "Investing", "Investment App",
    "Robinhood", "Webull", "Betterment", "Wealthfront", "Acorns", "Zerodha", "Groww", "PiggyVest", "Cowrywise", "Risevest",
    "Mutual Funds", "Brokerage", "Forex Broker", "FTMO", "Binance", "Coinbase", "Kraken", "Bybit", "OKX", "KuCoin", "Bitget",
    "Crypto.com", "Crypto Exchange", "Bitcoin Wallet", "Paxful", "Luno", "Quidax", "Trust Wallet", "MetaMask", "OpenSea",
    "Cloud Mining", "Staking Rewards", "Ponzi Club",
  ]) {
    assert.equal(category(name), "trading", name);
  }
});

test("gambling, casino and betting services are blocked", () => {
  for (const name of [
    "Bet365", "Bet 365", "1xBet", "Melbet", "Betway", "SportyBet", "Bet9ja", "BetKing", "NairaBet", "22Bet",
    "Parimatch", "BetWinner", "Mostbet", "1win", "Pin-Up", "Pin Up Casino", "Betfair", "William Hill", "Paddy Power",
    "Stake", "Roobet", "DraftKings", "FanDuel", "Casino", "Online Casino", "CasinoX", "Vulkan Casino", "Poker",
    "PokerStars", "Lottery", "Lotto", "Jackpot City", "Roulette Royale", "Blackjack", "Bingo Blitz", "Sportsbook",
    "Betting", "Gambling", "Slots", "Slotomania", "Fonbet", "BetBoom", "Powerball", "Mega Millions", "Wager",
    "Betika", "SportPesa", "Paripesa", "Megapari", "Linebet", "Bookmaker", "Bookie", "Real Money Games", "Rummy Circle",
    "Teen Patti", "Dream11", "Fantasy Cricket", "Fantasy Sports", "MPL", "Sweepstakes", "Chumba Casino", "Polymarket",
    "Kalshi", "Hellcase", "Key Drop", "CSGOEmpire", "Gamdom", "Keno", "Scratch Cards", "Football Pools",
  ]) {
    assert.equal(category(name), "gambling", name);
  }
});

test("tobacco and vaping services are blocked", () => {
  for (const name of ["Tobacco", "Cigars", "Cigarettes", "Marlboro", "IQOS", "JUUL", "Vape", "Vape Shop", "Vaping", "Hookah", "Shisha", "Nicotine Pouches", "E-Cigarette", "Snus", "Puff Bar", "Smoke Shop"]) {
    assert.equal(category(name), "tobacco", name);
  }
});

test("alcohol services are blocked", () => {
  for (const name of ["Alcohol", "Liquor Store", "Wine", "Wine.com", "Vivino", "Beer", "Untappd", "Drizly", "Total Wine", "Whiskey", "Vodka", "Brewery", "Heineken", "Guinness"]) {
    assert.equal(category(name), "alcohol", name);
  }
});

test("adult (18+) and escort services are blocked", () => {
  for (const name of [
    "Porn", "Pornhub", "XVideos", "XNXX", "xHamster", "OnlyFans", "Fansly", "Chaturbate", "Stripchat", "BongaCams",
    "LiveJasmin", "Adult", "Adult Chat", "XXX", "Sex Chat", "Escort", "Escorts", "Hookup", "NSFW", "AdultFriendFinder",
    "Ashley Madison", "Fetlife", "Camgirls", "Erotic Stories", "Sugar Daddy", "Brazzers", "ManyVids",
    "Escort Girls", "Call Girls", "Escort Service", "Adult Services", "Webcam Models", "Playboy", "Fanvue", "BDSM Chat", "Sex Shop",
  ]) {
    assert.equal(category(name), "adult", name);
  }
});

test("everyday services are never caught", () => {
  for (const name of [
    "WhatsApp", "Telegram", "Instagram", "Facebook", "Google/Gmail", "Twitter", "TikTok", "Uber", "Bolt", "Netflix",
    "Amazon", "PayPal", "Discord", "Snapchat", "LinkedIn", "Microsoft", "Apple", "Yahoo",
    "BetterHelp", "Sussex Bank", "Essex Hotels", "Liquorice Candy", "Wineglass App", "Beerus", "Stakeholder",
    "Deriving Math", "Slotted", "Cigarra", "Adult Swim", "Sextant Navigation", "Assessment Portal", "Match Masters", "Skype", "Viber", "Signal", "Line", "WeChat", "Airbnb", "Booking.com",
    "Fiverr", "Upwork", "Shopee", "Jumia", "Glovo", "DoorDash", "Steam", "Epic Games", "Spotify", "Zoom", "Slack",
    "Updating Service", "Alphabet", "Wise", "Revolut", "Payoneer", "Opay", "Kuda", "Flutterwave", "Paystack", "Temu", "AliExpress",
  ]) {
    assert.equal(category(name), null, name);
  }
});

test("dating platforms are blocked", () => {
  for (const name of [
    "Tinder", "Bumble", "Badoo", "Hinge", "OkCupid", "Grindr", "Happn", "Tantan", "POF", "Plenty of Fish", "eHarmony",
    "Match", "Match.com", "Zoosk", "Meetic", "Mamba", "Skout", "Jaumo", "Lovoo", "Feeld", "Coffee Meets Bagel", "Hily",
    "Dating", "Online Dating", "Singles", "Christian Mingle", "Omegle", "Azar", "Her", "Tagged",
  ]) {
    assert.equal(category(name), "dating", name);
  }
});

// Every name the payment provider's compliance team asked us to remove.
const COMPLIANCE_LIST =
  "PurePlatfrom, Hornet, Scruff, LeoList, Locanto, LoveRu, Tantan, Tango, TangoMe, Tangga, Sweetring, Skout, Smitten, Yubo, SayHi Chat, QuackQuack Dating App, Pairs, Omiai, MirZnakomstv, Meet Match, Muzz, Mylove, LOVOO, LoveAndSeek, Jeevansathi, Justdating, JD Dating, Happypancake, hily, Her, Hing Swipe App, Luxy, roomster, SoulApp, WooPlus, Yik Yak, Taki, Tind Swipe App, TeriMeriChoice, IPLwin, Jackaroo, Jalwa Games, Jeet11, Jeetexch, JojoBet, Khelraja, Kwiff, Leon Club, Lootably, Luck, luckgood, LuckyBike, Ludo Ninja, Ludo Winner, Ludo11, ludoplus, Ludosupreme, Madslots, MahaGames, MrGreen, MrQ, NCA888, NetBet, Nice88, OKbet, Okwin, OKVIP, OPAP, ParlayPlay, PeryaGame, PH777, PlayOJO, Playerzpot, PlayKaro, Pocket Ludo, POCKET PLAY, Porbet, Probo, Pusulabet, Qbet, QQPK, Raja Games, Riobet, Royale, Royaljeet, RoyalWin, Sankes and Ladders, Sisal, SisalFunClub, SkyBet, SNAI, Solitaire Cash, Sorare, Spincrush, SpinWinner, SportEfir, SportGully, Sportloto, Sportsbuzz11, Stanleybet, Stoiximan, Stormgain, Super Ace, Superbet, SynotTip, Tbigwin, Teenpati joy, Tiranga, TopGun, UWIN, ve88, Veera, Veergame, Vision11, Winclash, WinGo, WinMatch, Winner, WinzoGame, WOG, Wolf777, swerte88, YN777, Yono777, YoWin, YoHo, Zupee, \u0421hampion\u0421asino, Investro, Mainvest, Mudrex, Nifty, Stormgain, Univest, Vantage, XP Investimentos, Rothmans, Dunhill, BAT, Budweiser, Brahma, Corona, SpatenOktoberfest, Tennents".split(
    ", ",
  );

test("every service the compliance review named is blocked, by name and by slug", () => {
  for (const name of COMPLIANCE_LIST) {
    assert.notEqual(category(name), null, name);
    // A slug drops non-Latin letters, so only Latin names are checked by slug
    // alone; the adapter always passes the name too.
    if (/^[\x00-\x7f]+$/.test(name)) assert.equal(isRestrictedService(slugify(name)), true, `slug of ${name}`);
  }
});

test("services found in the live catalog review are blocked", () => {
  for (const name of [
    "Ace2Three", "Adda52", "Betflag", "BetOnRed", "Fastwin 2", "Gizbo", "Midnite", "Dangal365", "FDJ ParionsSport",
    "ContiCazino", "Ftx", "KCEX", "Weex", "MoonPay", "WikiFX", "Freedom24", "Blued", "TheL", "Colombian Cupid",
    "InternationalCupid", "Instamatch", "Photostrana", "FeetFinder", "Cityheaven", "Ero Me", "Winelab", "ZéDelivery",
  ]) {
    assert.notEqual(category(name), null, name);
  }
});

test("everyday services from the live catalog stay available", () => {
  for (const name of [
    "BeReal", "Beboo", "Beget", "Bata", "KoronaPay", "Koin", "Lotus", "LOTTE Mart", "Hermes", "Puresmooth",
    "Glovo", "Bit", "Booking.com", "Google, Gmail, Youtube", "Instagram + Threads", "Twitter / X", "Bolt", "OLX",
    "Jumia", "Coca-Cola", "Monster Energy", "Pepsi", "Paysafecard", "Skrill", "Payoneer", "Remitly", "Wise",
  ]) {
    assert.equal(category(name), null, name);
  }
});

test("look-alike Cyrillic letters do not hide a restricted name", () => {
  assert.equal(category("\u0421hampion\u0421asino"), "gambling");
  assert.equal(category("\u041crGreen"), "gambling");
  assert.equal(category("163\u0421OM"), null);
});

test("names close to restricted ones but harmless stay available", () => {
  for (const name of ["Alphabet", "1688", "7-Eleven", "Lucky Supermarket", "Pure Gym App", "Herbalife", "Royal Mail", "Winner Supermarket", "Batch", "Coronation Bank", "Tangerine", "Soulseek", "Liquorice Candy"]) {
    assert.equal(category(name), null, name);
  }
});

test("the slug alone is enough, and the reason is reported", () => {
  assert.equal(isRestrictedService("bet365"), true);
  assert.equal(isRestrictedService("pin-up-casino"), true);
  assert.equal(isRestrictedService("whatsapp"), false);
  assert.deepEqual(restrictedMatch("Pornhub"), { category: "adult", term: "porn" });
  assert.deepEqual(restrictedMatch("Casino X"), { category: "gambling", term: "casino" });
  assert.deepEqual(restrictedMatch("Tinder"), { category: "dating", term: "tinder" });
  assert.equal(isRestrictedService("binance"), true);
  assert.equal(isRestrictedService("match-com"), true);
});

test("a list splits into what may be sold and what is blocked", () => {
  const list = ["WhatsApp", "Bet365", "Telegram", "Exness", "OnlyFans", "IQOS", "Vivino", "Tinder", "Binance"].map((name) => ({ name, slug: slugify(name) }));
  const { allowed, blocked } = splitRestricted(list);
  assert.deepEqual(allowed.map((s) => s.name), ["WhatsApp", "Telegram"]);
  assert.deepEqual(blocked.map((s) => [s.name, s.category]), [
    ["Bet365", "gambling"],
    ["Exness", "trading"],
    ["OnlyFans", "adult"],
    ["IQOS", "tobacco"],
    ["Vivino", "alcohol"],
    ["Tinder", "dating"],
    ["Binance", "trading"],
  ]);
});
