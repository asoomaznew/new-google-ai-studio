const descWords = ['trading', 'company', 'wll', 'rent', '1188'];

for (let i = 0; i < descWords.length - 1; i++) {
  const phrase = `${descWords[i]} ${descWords[i+1]}`;
  const genericWords = "january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|year|month|company|co|ltd|wll|spc|est|trading|factory|\\d+";
  const regex = new RegExp(`^(${genericWords})\\s+(${genericWords})$`, 'i');
  const isDateOrGeneric = regex.test(phrase);
  
  if (isDateOrGeneric) {
    console.log("SKIPPED GENERIC:", phrase);
  } else {
    console.log("VALID PHRASE:", phrase);
  }
}
