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

test("forex and trading services are blocked", () => {
  for (const name of [
    "Forex", "Forex4You", "ForexTime", "Exness", "IQ Option", "IQOption", "Olymp Trade", "OlympTrade", "Quotex",
    "Pocket Option", "Binomo", "Deriv", "XM", "FBS", "HFM", "XTB", "MetaTrader 5", "Plus500", "eToro", "Pepperstone",
    "Binary Options", "Binary Options Trading", "CFD Trading", "AvaTrade", "Capital.com", "IC Markets", "RoboForex",
  ]) {
    assert.equal(category(name), "forex", name);
  }
});

test("gambling, casino and betting services are blocked", () => {
  for (const name of [
    "Bet365", "Bet 365", "1xBet", "Melbet", "Betway", "SportyBet", "Bet9ja", "BetKing", "NairaBet", "22Bet",
    "Parimatch", "BetWinner", "Mostbet", "1win", "Pin-Up", "Pin Up Casino", "Betfair", "William Hill", "Paddy Power",
    "Stake", "Roobet", "DraftKings", "FanDuel", "Casino", "Online Casino", "CasinoX", "Vulkan Casino", "Poker",
    "PokerStars", "Lottery", "Lotto", "Jackpot City", "Roulette Royale", "Blackjack", "Bingo Blitz", "Sportsbook",
    "Betting", "Gambling", "Slots", "Slotomania", "Fonbet", "BetBoom", "Powerball", "Mega Millions", "Wager",
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

test("adult (18+) services are blocked", () => {
  for (const name of [
    "Porn", "Pornhub", "XVideos", "XNXX", "xHamster", "OnlyFans", "Fansly", "Chaturbate", "Stripchat", "BongaCams",
    "LiveJasmin", "Adult", "Adult Chat", "XXX", "Sex Chat", "Escort", "Escorts", "Hookup", "NSFW", "AdultFriendFinder",
    "Ashley Madison", "Fetlife", "Camgirls", "Erotic Stories", "Sugar Daddy", "Brazzers", "ManyVids",
  ]) {
    assert.equal(category(name), "adult", name);
  }
});

test("everyday services are never caught", () => {
  for (const name of [
    "WhatsApp", "Telegram", "Instagram", "Facebook", "Google/Gmail", "Twitter", "TikTok", "Uber", "Bolt", "Netflix",
    "Amazon", "PayPal", "Binance", "Coinbase", "Discord", "Snapchat", "LinkedIn", "Microsoft", "Apple", "Yahoo",
    "Betterment", "BetterHelp", "Sussex Bank", "Essex Hotels", "Liquorice Candy", "Wineglass App", "Beerus", "Stakeholder",
    "Deriving Math", "Slotted", "Cigarra", "Adult Swim", "Sextant Navigation", "Assessment Portal", "Tinder", "Bumble",
    "Badoo", "Hinge", "OkCupid", "Grindr", "Skype", "Viber", "Signal", "Line", "WeChat", "Airbnb", "Booking.com",
    "Fiverr", "Upwork", "Shopee", "Jumia", "Glovo", "DoorDash", "Steam", "Epic Games", "Spotify", "Zoom", "Slack",
    "Tradingview", "Wise", "Revolut", "Payoneer", "Opay", "Kuda", "Flutterwave", "Paystack", "Temu", "AliExpress",
  ]) {
    assert.equal(category(name), null, name);
  }
});

test("the slug alone is enough, and the reason is reported", () => {
  assert.equal(isRestrictedService("bet365"), true);
  assert.equal(isRestrictedService("pin-up-casino"), true);
  assert.equal(isRestrictedService("whatsapp"), false);
  assert.deepEqual(restrictedMatch("Pornhub"), { category: "adult", term: "porn" });
  assert.deepEqual(restrictedMatch("Casino X"), { category: "gambling", term: "casino" });
});

test("a list splits into what may be sold and what is blocked", () => {
  const list = ["WhatsApp", "Bet365", "Telegram", "Exness", "OnlyFans", "IQOS", "Vivino"].map((name) => ({ name, slug: slugify(name) }));
  const { allowed, blocked } = splitRestricted(list);
  assert.deepEqual(allowed.map((s) => s.name), ["WhatsApp", "Telegram"]);
  assert.deepEqual(blocked.map((s) => [s.name, s.category]), [
    ["Bet365", "gambling"],
    ["Exness", "forex"],
    ["OnlyFans", "adult"],
    ["IQOS", "tobacco"],
    ["Vivino", "alcohol"],
  ]);
});
