/* Shared public Torque Nutri catalog in Personal/legacy nutrition.
 * Data and ODbL/DbCL downloads: ../nutri/data/README.md.
 * Existing foods and saved prescriptions are never rewritten.
 */
(function(root){
  'use strict';
  var foods=root.MT_ALIMENTOS||[],shared=root.MT_NUTRI_FOODS||[];
  var norm=function(v){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();};
  var ids=new Set(foods.map(function(f){return f.id||f.n;})),names=new Set(foods.map(function(f){return norm(f.n);}));
  shared.forEach(function(food){
    if(ids.has(food.id))return;
    var name=food.n+(food.brand?' — '+food.brand:'');
    if(names.has(norm(name)))name+=' — '+food.source;
    if(name.length>200||names.has(norm(name)))name=name.slice(0,155)+' · '+food.id;
    // Same per-100 g/ml values, copied into the existing portion-based model.
    // The canonical source object stays untouched for Torque Nutri.
    var copy=Object.assign({},food,{n:name});
    ids.add(food.id);names.add(norm(name));foods.push(copy);
  });
  root.MT_ALIMENTOS=foods;
})(self);
