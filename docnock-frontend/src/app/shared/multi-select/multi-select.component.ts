import { Component, EventEmitter, forwardRef, Input, OnInit, Output } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';


@Component({
  selector: 'app-multi-select',
  templateUrl: './multi-select.component.html',
  styleUrls: ['./multi-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectComponent),
      multi: true
    }
  ]
})
export class MultiSelectComponent implements OnInit,ControlValueAccessor {
  @Input() items: any[] = [];  // Dropdown list items
  @Input() bindLabel: string = 'label';  // Label key
  @Input() bindValue: string = 'value';  // Value key
  @Input() multiple: boolean = true;  // Single or multiple select
  @Input() loading: boolean = false;  // Loading state
  @Input() placeholder: string = 'Select'; // Placeholder text
  @Input() selectedItems: any = null;
  @Input() searchable: boolean = true; // Searchable option
  @Input() compareWith!: (a: any, b: any) => boolean;
  
  @Output() selectionChange = new EventEmitter<any[]>();  // Emit selected values
  @Output() loadMore = new EventEmitter<void>();  // Emit event when scrolled to end
  @Output() search = new EventEmitter<string>();  // Emit search term
  @Input() placeholderText: string = "";
  searchQuery: string = '';
  searchSubject: Subject<string> = new Subject();
  isDropdownOpen: boolean = false;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  disabled = false;


  // 🔹 Angular will call this to update the component with a new value
  writeValue(value: any): void {
    console.log('writeValue called with:', value); // Debugging log
    this.selectedItems = value || (this.multiple ? [] : null);
  }

  // 🔹 Registers the change function
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  // 🔹 Registers the touched function
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  // 🔹 Implement `setDisabledState`
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }


  ngOnInit(): void {
    // Debounce search input
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe((searchTerm) => {
      this.search.emit(searchTerm);
    });
    console.log(this.selectedItems,"===12344",this.items);
    
     
    if(this.selectedItems.length >0){
      this.placeholderText=''
    }
  }

  // Handle item selection
  onSelectionChange(selected: any): void {
    if (this.multiple) {
      this.selectedItems = selected;
      if (this.selectedItems && this.selectedItems.length > 0) {
        this.placeholderText = ''; // Remove placeholder when something is selected
      } else {
        this.placeholderText = 'Search Associate User'; // Show placeholder if nothing is selected
      }
    } else {
      this.selectedItems = selected ? selected : null; // Store as a single object
      if (this.selectedItems) {
        this.placeholderText = ''; // Remove placeholder when something is selected
      } else {
        this.placeholderText = 'Search Associate User'; // Show placeholder if nothing is selected
      }
    }
    console.log(this.selectedItems,"chekc selef");
    
   
    this.onChange(this.selectedItems);  // Notify form control
    this.onTouched()
    this.selectionChange.emit(this.multiple ? this.selectedItems : this.selectedItems || null);
  }

  toggleDropdownClass() {
    setTimeout(() => {
      console.log("check log");
    
      this.isDropdownOpen = !this.isDropdownOpen;
    }, 2000);
   
  }

  // Remove selected item
  removeItem(item: any): void {
    if (this.multiple) {
      this.selectedItems = this.selectedItems.filter((i:any) => i[this.bindValue] !== item[this.bindValue]);
    } else {
      this.selectedItems = null; // Clear selection when single
    }
    this.onChange(this.selectedItems);
    this.selectionChange.emit(this.multiple ? this.selectedItems : null);
  }
  

  // Search handler
  onSearch(event: any): void {
    this.searchSubject.next(event.term);
  }

  // Load more items on scroll
  onScrollToEnd(): void {
    this.loadMore.emit();
  }

  get selectedModel() {
    return this.multiple ? this.selectedItems : this.selectedItems?.[0] || null;
  }
  
  set selectedModel(value: any) {
    if (this.multiple) {
      this.selectedItems = value || [];
    } else {
      this.selectedItems = value ? [value] : [];
    }
    this.selectionChange.emit(this.selectedItems);
  }
  

  onDropdownOpen() {
    setTimeout(() => {
      this.isDropdownOpen = true;
      this.applyDropdownStyles();
    }, 0);
  }

  onDropdownClose() {
    this.isDropdownOpen = false;
  }

  applyDropdownStyles() {
    setTimeout(() => {
      const dropdown = document.querySelector('.ng-dropdown-panel');
      if (dropdown) {
        (dropdown as HTMLElement).style.position = 'absolute';
        (dropdown as HTMLElement).style.zIndex = '1050';
        (dropdown as HTMLElement).style.maxHeight = '166px';
        (dropdown as HTMLElement).style.overflowY = 'auto';
        (dropdown as HTMLElement).style.left = '0';
        (dropdown as HTMLElement).style.width = '100%';
        (dropdown as HTMLElement).style.overflowX = 'scroll';
        // (dropdown as HTMLElement).style.background = var(--bg-light);
      }
      const newdrop = document.querySelector('.scroll-host');
      if (newdrop) {
        (newdrop as HTMLElement).style.margin = '10px 0';
      }
      
    }, 10);
  
  }
}
