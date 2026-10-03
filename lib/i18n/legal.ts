// Draft bidding terms and privacy notice. Have a UAE lawyer review both before launch.
import type { Locale } from "../types";

type Section = [string, string[]];
type Doc = { updated: string; intro: string; sections: Section[] };

export function termsDoc(locale: Locale, opts: { payDays: number; timer: string; fee: string }): Doc {
  const { payDays, timer, fee } = opts;
  if (locale === "ar") {
    return {
      updated: "آخر تحديث: أكتوبر 2026",
      intro: "تنطبق هذه الشروط على كل مزايدة في مزادات تايم سوق، سواء عبر الموقع أو إنستغرام أو واتساب أو الهاتف. بالتسجيل أو المزايدة فإنك توافق عليها.",
      sections: [
        ["1. من نحن", ["تايم سوق تاجر ساعات مستعملة في دبي، الإمارات العربية المتحدة. نبيع ساعات من مخزوننا وساعات يعرضها أصحابها لدينا. لا نتبع للعلامات التجارية التي نبيعها."]],
        ["2. التسجيل", ["يجب أن يكون عمرك 21 عاماً على الأقل. نوثّق بريدك الإلكتروني ورقم هاتفك، وقد نطلب هويتك قبل تسليم أي ساعة.", "رقم المزايدة شخصي. أنت مسؤول عن كل مزايدة تُقدَّم من حسابك أو برقمك."]],
        ["3. المزايدة", [`تُعرض كل قطعة لمدة ${timer} على المنصة. لا يوجد وقت إضافي: عند وصول المؤقت إلى 0:00 تفوز أعلى مزايدة مستلمة.`, "وقت خوادمنا هو المرجع لمزايدات الموقع. يتأخر بث إنستغرام بضع ثوانٍ؛ تُعتمد مزايدة إنستغرام إذا رآها المُزايِد قبل 0:00.", "عند التساوي تفوز المزايدة الأسبق. الحد الأقصى ينفّذ نيابة عنك خطوة بخطوة ويبقى سرياً.", "قرار المُزايِد نهائي في أي خلاف، ويحق له إعادة فتح القطعة أو سحبها."]],
        ["4. الحد الأدنى والبيع المؤكد", ["لمعظم القطع حد أدنى سري. إذا لم تبلغه المزايدات لا تُباع القطعة. «البيع المؤكد» يعني أن الحد الأدنى قد تحقق أو أُلغي."]],
        ["5. المزايدة ملزمة", ["المزايدة الفائزة عقد شراء ملزم بالمبلغ الذي زايدت به. لا توجد عمولة على المشتري."]],
        ["6. الدفع", [`يجب الدفع خلال ${payDays} أيام عمل (من الإثنين إلى الجمعة) بالبطاقة أو التحويل البنكي أو تابي أو تمارا. تقرر تابي وتمارا الموافقة بنفسيهما.`, "إذا لم تدفع في الموعد يحق لنا إلغاء البيع وعرض الساعة على مزايد آخر وتعليق حسابك."]],
        ["7. الحالة والأصالة", ["نصف كل ساعة بأمانة ونضمن أصالتها. الساعات المستعملة تحمل آثار استخدام؛ يُرجى قراءة تقرير الحالة وطلب صور إضافية قبل المزايدة.", "إذا ثبت أن ساعة اشتريتها غير أصلية نعيد لك المبلغ كاملاً عند إعادتها بحالتها."]],
        ["8. الاستلام والتوصيل", ["تنتقل الملكية بعد استلام الدفع كاملاً. الاستلام من دبي أو التوصيل داخل الإمارات وعُمان والسعودية على نفقة المشتري."]],
        ["9. البائعون", [`رسوم البائع ${fee}% من سعر البيع. يضمن البائع ملكيته للساعة وحقه في بيعها.`]],
        ["10. القانون", ["تخضع هذه الشروط لقوانين إمارة دبي ودولة الإمارات العربية المتحدة."]]
      ]
    };
  }
  return {
    updated: "Last updated: October 2026",
    intro: "These terms apply to every bid in a The Time Souk auction, whether placed on this website, on Instagram, by WhatsApp or by phone. By registering or bidding, you agree to them.",
    sections: [
      ["1. Who we are", ["The Time Souk is a pre-owned watch dealer in Dubai, United Arab Emirates. We sell watches from our own stock and watches consigned to us by their owners. We are not affiliated with the brands we sell."]],
      ["2. Registering", ["You must be at least 21. We verify your email and mobile number, and we may ask for your ID before handing over a watch.", "Your paddle number is personal. You are responsible for every bid made from your account or under your paddle number."]],
      ["3. Bidding", [`Each lot is on the block for ${timer}. There is no extra time: when the timer reaches 0:00, the highest bid received wins.`, "Our server’s clock decides for website bids. Instagram runs a few seconds behind; an Instagram bid counts if the auctioneer sees it before 0:00.", "If two bids are the same, the earlier one wins. Max bids are placed for you one step at a time and stay confidential.", "The auctioneer’s decision is final in any dispute. The auctioneer may reopen or withdraw a lot."]],
      ["4. Reserves and pure sales", ["Most lots have a confidential reserve. If bidding doesn’t reach it, the lot is not sold. “Pure sale” means the reserve has been met or waived."]],
      ["5. Bids are binding", ["A winning bid is a binding contract to buy the watch for the amount you bid. There is no buyer’s premium."]],
      ["6. Payment", [`Pay within ${payDays} working days (Monday to Friday) by card, bank transfer, Tabby or Tamara. Tabby and Tamara decide their own approvals.`, "If you don’t pay on time we may cancel the sale, offer the watch to another bidder and suspend your account."]],
      ["7. Condition and authenticity", ["We describe every watch honestly and guarantee it is authentic. Pre-owned watches show signs of use; read the condition report and ask for more photos before you bid.", "If a watch you bought proves not to be authentic, we refund you in full when you return it in the same condition."]],
      ["8. Collection and delivery", ["Ownership passes once we have received payment in full. Collect in Dubai, or we deliver across the UAE, Oman and Saudi Arabia at the buyer’s cost."]],
      ["9. Sellers", [`The seller fee is ${fee}% of the hammer price. Sellers confirm they own the watch and have the right to sell it.`]],
      ["10. Law", ["These terms are governed by the laws of the Emirate of Dubai and the United Arab Emirates."]]
    ]
  };
}

export function privacyDoc(locale: Locale): Doc {
  if (locale === "ar") {
    return {
      updated: "آخر تحديث: أكتوبر 2026",
      intro: "يوضح هذا الإشعار البيانات التي تجمعها تايم سوق وكيف نستخدمها.",
      sections: [
        ["ما نجمعه", ["اسمك وبريدك الإلكتروني ورقم هاتفك ودولتك وحساب إنستغرام إن أضفته، ومزايداتك ومشترياتك ومدفوعاتك. لا نحتفظ ببيانات بطاقتك؛ تتولاها زينة وتابي وتمارا."]],
        ["لماذا", ["لتشغيل المزادات، والتحقق من هوية المزايدين، وإرسال الفواتير والتذكيرات، والوفاء بالتزاماتنا القانونية ومنها مكافحة غسل الأموال."]],
        ["من يطّلع عليها", ["مزودو الخدمة الذين نستخدمهم: Supabase (قاعدة البيانات)، وVercel (الاستضافة)، وTwilio (الرموز وواتساب)، وResend (البريد)، وزينة وتابي وتمارا (الدفع). لا نبيع بياناتك.", "يظهر للعامة رقم المزايدة والمبلغ فقط، وليس اسمك."]],
        ["حقوقك", ["يمكنك طلب نسخة من بياناتك أو تصحيحها أو حذفها بمراسلتنا. نحتفظ بسجلات البيع المطلوبة قانوناً."]]
      ]
    };
  }
  return {
    updated: "Last updated: October 2026",
    intro: "This notice explains what The Time Souk collects and how we use it.",
    sections: [
      ["What we collect", ["Your name, email, mobile number, country, Instagram handle if you add it, and your bids, purchases and payments. We never store your card details; Ziina, Tabby and Tamara handle those."]],
      ["Why", ["To run the auctions, verify who is bidding, send invoices and reminders, and meet our legal obligations, including anti-money-laundering rules."]],
      ["Who sees it", ["The service providers we use: Supabase (database), Vercel (hosting), Twilio (codes and WhatsApp), Resend (email), and Ziina, Tabby and Tamara (payments). We don’t sell your data.", "The public only sees your paddle number and bid amounts, never your name."]],
      ["Your rights", ["Ask us for a copy of your data, or to correct or delete it. We keep sales records for as long as the law requires."]]
    ]
  };
}
